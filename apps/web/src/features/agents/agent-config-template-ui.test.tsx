import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import {
  AgentConfigTemplate,
  CopyTextButton,
} from './agent-config-template-ui.tsx';

let downloadedName = '';
let createdBlobs: Blob[] = [];
const createObjectURL = vi.fn((blob: Blob) => {
  createdBlobs.push(blob);
  return 'blob:print-agent';
});

function setup() {
  downloadedName = '';
  createdBlobs = [];
  vi.stubGlobal(
    'URL',
    Object.assign(URL, {
      createObjectURL,
      revokeObjectURL: vi.fn(),
    }),
  );
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    downloadedName = this.download;
  });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  createObjectURL.mockClear();
});

it('downloads a token-free print-agent.json configuration', async () => {
  setup();
  render(<AgentConfigTemplate printerId="front-desk" />);
  fireEvent.click(screen.getByText('設定テンプレート'));
  fireEvent.click(
    screen.getByRole('button', { name: '設定テンプレートをダウンロード' }),
  );

  expect(downloadedName).toBe('print-agent.json');
  expect(createObjectURL).toHaveBeenCalledOnce();
  const [blob] = createdBlobs;
  expect(blob).toBeInstanceOf(Blob);
  const contents = await blob.text();
  expect(JSON.parse(contents)).toEqual({
    schemaVersion: 1,
    printerId: 'front-desk',
    driver: { type: 'tm-t88v-usb', devicePath: '/dev/usb/lp0' },
  });
  expect(contents).not.toContain('AGENT_TOKEN');
});

it.each([
  [
    'ESC/POS TCP',
    'escpos-tcp',
    { type: 'escpos-tcp', address: '127.0.0.1:9100' },
  ],
  [
    'JSON file',
    'json-file',
    { type: 'json-file', outputDir: '/var/lib/print-agent/previews' },
  ],
] as const)(
  'downloads the selected %s configuration',
  async (_label, driverType, expectedDriver) => {
    setup();
    render(<AgentConfigTemplate printerId="front-desk" />);
    fireEvent.click(screen.getByText('設定テンプレート'));
    fireEvent.change(screen.getByLabelText('ドライバー'), {
      target: { value: driverType },
    });
    fireEvent.click(
      screen.getByRole('button', { name: '設定テンプレートをダウンロード' }),
    );

    const [blob] = createdBlobs;
    expect(blob).toBeInstanceOf(Blob);
    expect(JSON.parse(await blob.text()).driver).toEqual(expectedDriver);
  },
);

it('announces invalid input and prevents template generation', () => {
  setup();
  render(<AgentConfigTemplate printerId="front-desk" />);
  fireEvent.click(screen.getByText('設定テンプレート'));
  fireEvent.change(screen.getByLabelText('デバイスパス'), {
    target: { value: 'dev/usb/lp0' },
  });

  expect(screen.getByRole('alert').textContent).toContain('絶対パス');
  expect(
    (
      screen.getByRole('button', {
        name: '設定テンプレートをダウンロード',
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  expect(createObjectURL).not.toHaveBeenCalled();
});

it('announces an invalid TCP address and prevents template generation', () => {
  setup();
  render(<AgentConfigTemplate printerId="front-desk" />);
  fireEvent.click(screen.getByText('設定テンプレート'));
  fireEvent.change(screen.getByLabelText('ドライバー'), {
    target: { value: 'escpos-tcp' },
  });
  fireEvent.change(screen.getByLabelText('プリンターアドレス (host:port)'), {
    target: { value: 'bad host:9100' },
  });

  expect(screen.getByRole('alert').textContent).toContain('host:port');
  expect(
    (
      screen.getByRole('button', {
        name: '設定テンプレートをダウンロード',
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  expect(createObjectURL).not.toHaveBeenCalled();
});

it('shows a newly issued token only in the copyable environment example', () => {
  setup();
  render(
    <AgentConfigTemplate
      printerId="front-desk"
      agentToken="issued-one-time-token"
    />,
  );
  fireEvent.click(screen.getByText('設定テンプレート'));

  const config =
    screen.getByRole('figure', { name: 'print-agent.json' }).textContent ?? '';
  const environment =
    screen.getByRole('figure', { name: '環境変数ファイルの雛形' })
      .textContent ?? '';
  expect(config).not.toContain('issued-one-time-token');
  expect(environment).toContain('AGENT_TOKEN=issued-one-time-token');
});

it('copies text and announces success', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal(
    'navigator',
    Object.assign(navigator, { clipboard: { writeText } }),
  );
  render(<CopyTextButton text="front-desk" label="printerIdをコピー" />);
  fireEvent.click(screen.getByRole('button', { name: 'printerIdをコピー' }));

  expect(await screen.findByText('コピーしました。')).toBeTruthy();
  expect(writeText).toHaveBeenCalledWith('front-desk');
});
