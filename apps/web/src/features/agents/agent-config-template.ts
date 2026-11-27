export type AgentDriverType = 'tm-t88v-usb' | 'escpos-tcp' | 'json-file';

export type AgentConfigDraft = {
  printerId: string;
  driverType: AgentDriverType;
  devicePath: string;
  address: string;
  outputDir: string;
  configPath: string;
};

type AgentConfigField =
  | 'printerId'
  | 'devicePath'
  | 'address'
  | 'outputDir'
  | 'configPath';

type AgentDriverConfig =
  | { type: 'tm-t88v-usb'; devicePath: string }
  | { type: 'escpos-tcp'; address: string }
  | { type: 'json-file'; outputDir: string };

export type AgentConfigTemplateResult =
  | {
      ok: true;
      configJson: string;
      envText: string;
    }
  | {
      ok: false;
      errors: Partial<Record<AgentConfigField, string>>;
    };

const printerIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const escposHostnamePattern =
  /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?))*\.?$/i;

function isAbsoluteLinuxPath(value: string) {
  return value.startsWith('/');
}

function isValidEscposAddress(value: string) {
  const match = /^(?:([^:[\]]+)|\[([^\]]+)\]):(\d+)$/.exec(value);
  if (match === null) return false;
  const host = match[1] ?? match[2];
  const portText = match[3];
  if (host === undefined || portText === undefined) return false;

  let validHost = escposHostnamePattern.test(host);
  if (match[2] !== undefined) {
    try {
      validHost = new URL(`http://[${host}]/`).hostname.startsWith('[');
    } catch {
      validHost = false;
    }
  }

  const port = Number(portText);
  return validHost && Number.isInteger(port) && port >= 1 && port <= 65535;
}

export function generateAgentConfigTemplate(
  draft: AgentConfigDraft,
  apiBaseUrl: string,
  agentToken?: string,
): AgentConfigTemplateResult {
  const errors: Partial<Record<AgentConfigField, string>> = {};
  if (!printerIdPattern.test(draft.printerId)) {
    errors.printerId =
      'プリンターIDは小文字の英数字とハイフンを使い、先頭・末尾にハイフンを置けません。';
  }
  if (
    !isAbsoluteLinuxPath(draft.configPath) ||
    /[\r\n]/.test(draft.configPath)
  ) {
    errors.configPath =
      '設定 JSON の保存先に改行なしの絶対パスを入力してください。';
  }

  let driver: AgentDriverConfig;
  switch (draft.driverType) {
    case 'tm-t88v-usb':
      if (!isAbsoluteLinuxPath(draft.devicePath)) {
        errors.devicePath = 'デバイスパスに絶対パスを入力してください。';
      }
      driver = { type: draft.driverType, devicePath: draft.devicePath };
      break;
    case 'escpos-tcp':
      if (!isValidEscposAddress(draft.address)) {
        errors.address =
          'アドレスは host:port 形式で、ポートは 1〜65535 の数値を指定してください。';
      }
      driver = { type: draft.driverType, address: draft.address };
      break;
    case 'json-file':
      if (!isAbsoluteLinuxPath(draft.outputDir)) {
        errors.outputDir = '出力先に絶対パスを入力してください。';
      }
      driver = { type: draft.driverType, outputDir: draft.outputDir };
      break;
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const config = {
    schemaVersion: 1,
    printerId: draft.printerId,
    driver,
  };
  return {
    ok: true,
    configJson: `${JSON.stringify(config, null, 2)}\n`,
    envText: [
      `API_BASE_URL=${apiBaseUrl}`,
      `AGENT_TOKEN=${agentToken === undefined ? 'REPLACE_WITH_ISSUED_AGENT_TOKEN' : agentToken}`,
      `PRINT_AGENT_CONFIG_PATH=${draft.configPath}`,
      '',
    ].join('\n'),
  };
}
