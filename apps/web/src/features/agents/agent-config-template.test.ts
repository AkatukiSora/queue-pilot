import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  type AgentConfigDraft,
  generateAgentConfigTemplate,
} from './agent-config-template.ts';

const baseDraft: AgentConfigDraft = {
  printerId: 'front-desk',
  driverType: 'tm-t88v-usb',
  devicePath: '/dev/usb/lp0',
  address: '127.0.0.1:9100',
  outputDir: '/var/lib/print-agent/previews',
  configPath: '/etc/print-agent/print-agent.json',
};

function fixture(name: string) {
  return readFileSync(
    resolve(
      process.cwd(),
      `../print-agent/internal/printagent/testdata/config-templates/${name}.json`,
    ),
    'utf8',
  );
}

describe('generateAgentConfigTemplate', () => {
  it.each([
    ['tm-t88v-usb', 'tm-t88v-usb'],
    ['escpos-tcp', 'escpos-tcp'],
    ['json-file', 'json-file'],
  ] as const)('matches the Go parser fixture for %s', (driverType, file) => {
    const result = generateAgentConfigTemplate(
      { ...baseDraft, driverType },
      'https://tickets.example.test',
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected a valid template.');
    expect(result.configJson).toBe(fixture(file));
    expect(result.envText).toContain(
      'PRINT_AGENT_CONFIG_PATH=/etc/print-agent/print-agent.json',
    );
    expect(result.envText).toContain(
      'AGENT_TOKEN=REPLACE_WITH_ISSUED_AGENT_TOKEN',
    );
  });

  it('keeps an issued token only in the copyable environment text', () => {
    const token = 'one-time-agent-token-value';
    const result = generateAgentConfigTemplate(
      baseDraft,
      'https://tickets.example.test',
      token,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected a valid template.');
    expect(result.configJson).not.toContain(token);
    expect(result.envText).toContain(`AGENT_TOKEN=${token}`);
  });

  it.each([
    ['empty printerId', { printerId: '' }, 'printerId'],
    ['uppercase printerId', { printerId: 'Front-desk' }, 'printerId'],
    ['relative device path', { devicePath: 'dev/usb/lp0' }, 'devicePath'],
    [
      'empty output directory',
      { driverType: 'json-file', outputDir: '' },
      'outputDir',
    ],
    ['relative config path', { configPath: 'print-agent.json' }, 'configPath'],
    [
      'line break in config path',
      {
        configPath:
          '/etc/print-agent/print-agent.json\nAPI_BASE_URL=https://evil.example',
      },
      'configPath',
    ],
    [
      'invalid TCP address',
      { driverType: 'escpos-tcp', address: 'printer:65536' },
      'address',
    ],
    [
      'whitespace in TCP host',
      { driverType: 'escpos-tcp', address: 'bad host:9100' },
      'address',
    ],
    [
      'invalid bracketed TCP host',
      { driverType: 'escpos-tcp', address: '[not-ip]:9100' },
      'address',
    ],
    [
      'bracketed IPv4 TCP host',
      { driverType: 'escpos-tcp', address: '[127.0.0.1]:9100' },
      'address',
    ],
    [
      'signed TCP port',
      { driverType: 'escpos-tcp', address: 'printer:+9100' },
      'address',
    ],
    [
      'missing TCP port',
      { driverType: 'escpos-tcp', address: 'printer' },
      'address',
    ],
  ] as const)('rejects %s', (_name, values, field) => {
    const result = generateAgentConfigTemplate(
      { ...baseDraft, ...values },
      'https://tickets.example.test',
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected template validation to fail.');
    expect(result.errors[field]).toBeTruthy();
  });

  it.each(['printer.local:9100', '127.0.0.1:9100', '[::1]:9100'])(
    'accepts a valid TCP address: %s',
    (address) => {
      const result = generateAgentConfigTemplate(
        { ...baseDraft, driverType: 'escpos-tcp', address },
        'https://tickets.example.test',
      );
      expect(result.ok).toBe(true);
    },
  );
});
