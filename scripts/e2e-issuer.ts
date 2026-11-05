import {
  createHash,
  generateKeyPairSync,
  randomBytes,
  sign,
} from 'node:crypto';
import { createServer, type IncomingMessage } from 'node:http';

const clientId = 'e2e-client';
const clientSecret = randomBytes(24).toString('base64url');

type PendingCode = {
  subject: string;
  nonce: string | null;
  challenge: string | null;
  redirectUri: string;
};

export type MockIssuer = {
  issuer: string;
  clientId: string;
  clientSecret: string;
  /** 次の authorize で承認するユーザー (OIDC sub)。 */
  loginAs: (subject: string) => void;
  /** id_token の iat/exp に使う時刻。API の固定時計と揃える。 */
  setNow: (now: Date) => void;
  stop: () => Promise<void>;
};

function base64Url(value: Buffer | string) {
  return Buffer.from(value).toString('base64url');
}

async function readForm(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

/** 使い捨ての OIDC issuer。discovery / authorize / token / jwks / userinfo だけを提供する。 */
export async function startMockIssuer(initialNow: Date): Promise<MockIssuer> {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  const keyId = randomBytes(8).toString('hex');
  const jwk = {
    ...publicKey.export({ format: 'jwk' }),
    kid: keyId,
    alg: 'RS256',
    use: 'sig',
  };
  const codes = new Map<string, PendingCode>();
  let subject = 'e2e-admin';
  let now = initialNow;
  let issuer = '';

  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', issuer || 'http://127.0.0.1');
    const json = (status: number, body: unknown) => {
      response.writeHead(status, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      });
      response.end(JSON.stringify(body));
    };

    if (url.pathname === '/.well-known/openid-configuration') {
      json(200, {
        issuer,
        authorization_endpoint: `${issuer}/authorize`,
        token_endpoint: `${issuer}/token`,
        userinfo_endpoint: `${issuer}/userinfo`,
        jwks_uri: `${issuer}/jwks`,
        response_types_supported: ['code'],
        subject_types_supported: ['public'],
        id_token_signing_alg_values_supported: ['RS256'],
        code_challenge_methods_supported: ['S256'],
        token_endpoint_auth_methods_supported: [
          'client_secret_basic',
          'client_secret_post',
        ],
      });
      return;
    }
    if (url.pathname === '/jwks') {
      json(200, { keys: [jwk] });
      return;
    }
    if (url.pathname === '/authorize') {
      const redirectUri = url.searchParams.get('redirect_uri');
      const state = url.searchParams.get('state');
      if (
        url.searchParams.get('client_id') !== clientId ||
        redirectUri === null ||
        state === null
      ) {
        json(400, { error: 'invalid_request' });
        return;
      }
      const code = randomBytes(16).toString('base64url');
      codes.set(code, {
        subject,
        nonce: url.searchParams.get('nonce'),
        challenge: url.searchParams.get('code_challenge'),
        redirectUri,
      });
      const target = new URL(redirectUri);
      target.searchParams.set('code', code);
      target.searchParams.set('state', state);
      target.searchParams.set('iss', issuer);
      response.writeHead(302, { Location: target.href });
      response.end();
      return;
    }
    if (url.pathname === '/token' && request.method === 'POST') {
      const form = await readForm(request);
      const basic = request.headers.authorization?.startsWith('Basic ')
        ? Buffer.from(request.headers.authorization.slice(6), 'base64')
            .toString('utf8')
            .split(':')
            .map(decodeURIComponent)
        : [form.get('client_id'), form.get('client_secret')];
      const pending = codes.get(form.get('code') ?? '');
      const verifier = form.get('code_verifier');
      if (
        basic[0] !== clientId ||
        basic[1] !== clientSecret ||
        pending === undefined ||
        pending.redirectUri !== form.get('redirect_uri') ||
        (pending.challenge !== null &&
          (verifier === null ||
            createHash('sha256').update(verifier).digest('base64url') !==
              pending.challenge))
      ) {
        json(400, { error: 'invalid_grant' });
        return;
      }
      codes.delete(form.get('code') ?? '');
      const issuedAt = Math.floor(now.getTime() / 1000);
      const header = base64Url(
        JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: keyId }),
      );
      const payload = base64Url(
        JSON.stringify({
          iss: issuer,
          sub: pending.subject,
          aud: clientId,
          iat: issuedAt,
          exp: issuedAt + 3600,
          ...(pending.nonce === null ? {} : { nonce: pending.nonce }),
          name: pending.subject,
          preferred_username: pending.subject,
        }),
      );
      const signature = sign(
        'sha256',
        Buffer.from(`${header}.${payload}`),
        privateKey,
      );
      json(200, {
        access_token: randomBytes(16).toString('base64url'),
        token_type: 'Bearer',
        expires_in: 3600,
        scope: 'openid profile email',
        id_token: `${header}.${payload}.${base64Url(signature)}`,
      });
      return;
    }
    if (url.pathname === '/userinfo') {
      json(200, { sub: subject, name: subject });
      return;
    }
    json(404, { error: 'not_found' });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('Mock issuer has no TCP address.');
  }
  issuer = `http://127.0.0.1:${address.port}`;

  return {
    issuer,
    clientId,
    clientSecret,
    loginAs: (next) => {
      subject = next;
    },
    setNow: (next) => {
      now = next;
    },
    stop: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections();
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}
