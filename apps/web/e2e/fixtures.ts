import {
  type BrowserContext,
  test as base,
  expect,
  type Page,
} from '@playwright/test';
import {
  type E2EStack,
  e2eFixedTime,
  people,
  withE2EStack,
} from '../../../scripts/e2e-stack.ts';

export type { E2EStack };
export { e2eFixedTime, expect, people };

type Person = (typeof people)[keyof typeof people];

/**
 * Web は provider 'github' で開始するが、mock issuer は OIDC provider
 * ('oidc') として登録されているため、開始リクエストだけ書き換える。
 */
async function routeOidcProvider(page: Page) {
  await page.route('**/api/auth/sign-in/social', async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    await route.continue({
      postData: JSON.stringify({ ...body, provider: 'oidc' }),
    });
  });
}

async function signInPage(
  page: Page,
  stack: E2EStack,
  person: Person,
  path: string,
) {
  stack.issuer.loginAs(person);
  await page.goto(path);
  await page.getByRole('button', { name: 'GitHubでログイン' }).click();
  await page.waitForURL((url) => url.pathname === path.split('?')[0]);
  await expect(
    page.getByRole('button', { name: 'GitHubでログイン' }),
  ).toBeHidden();
}

type Fixtures = {
  /** 現在のページで mock issuer を通してログインする。 */
  signIn: (person: Person, path: string) => Promise<void>;
  openSecondSession: (person: Person, path: string) => Promise<Page>;
  /** ページが発行した /api/v3/ へのリクエスト URL を記録する。 */
  scopedRequests: () => string[];
};

export const test = base.extend<Fixtures, { stack: E2EStack }>({
  stack: [
    // 使い捨ての PostgreSQL / mock issuer / API を worker 全体で 1 組だけ起動する。
    // biome-ignore lint/correctness/noEmptyPattern: Playwright requires destructured fixture dependencies.
    async ({}, use) => {
      let release: () => void = () => {};
      const released = new Promise<void>((resolve) => {
        release = resolve;
      });
      let resolveStack: (stack: E2EStack) => void = () => {};
      const ready = new Promise<E2EStack>((resolve) => {
        resolveStack = resolve;
      });
      const finished = withE2EStack(async (stack) => {
        resolveStack(stack);
        await released;
      });
      const stack = await Promise.race([
        ready,
        finished.then(() => {
          throw new Error('E2E stack stopped before it became ready.');
        }),
      ]);
      await use(stack);
      release();
      await finished;
    },
    { scope: 'worker', timeout: 180_000 },
  ],

  page: async ({ page, stack }, use) => {
    stack.issuer.setNow(new Date(e2eFixedTime));
    await routeOidcProvider(page);
    await use(page);
  },

  signIn: async ({ page, stack }, use) => {
    await use((person, path) => signInPage(page, stack, person, path));
  },

  /** 別の browser context (別セッション) で同じ person としてログインしたページ。 */
  openSecondSession: async ({ browser, stack }, use) => {
    const contexts: BrowserContext[] = [];
    await use(async (person, path) => {
      const context = await browser.newContext();
      contexts.push(context);
      const second = await context.newPage();
      await second.clock.setFixedTime(e2eFixedTime);
      await routeOidcProvider(second);
      await signInPage(second, stack, person, path);
      return second;
    });
    await Promise.all(contexts.map((context) => context.close()));
  },

  scopedRequests: async ({ page }, use) => {
    const urls: string[] = [];
    page.on('request', (request) => {
      const { pathname } = new URL(request.url());
      if (pathname.startsWith('/api/v3/t/')) urls.push(pathname);
    });
    await use(() => urls);
  },
});

/** 管理画面の読み込み完了 (heading) を待つ。 */
export async function expectAdminScreen(page: Page) {
  await expect(page.getByRole('heading', { name: '管理画面' })).toBeVisible();
}
