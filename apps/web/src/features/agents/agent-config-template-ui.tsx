import { useId, useState } from 'react';
import { Button } from '../../components/ui/button.tsx';
import {
  type AgentDriverType,
  generateAgentConfigTemplate,
} from './agent-config-template.ts';
import { AGENT_SETUP_LINKS } from './agent-setup.tsx';

export function AgentConfigTemplate({
  printerId,
  agentToken,
}: {
  printerId: string;
  agentToken?: string;
}) {
  const id = useId();
  const [driverType, setDriverType] = useState<AgentDriverType>('tm-t88v-usb');
  const [devicePath, setDevicePath] = useState('/dev/usb/lp0');
  const [address, setAddress] = useState('127.0.0.1:9100');
  const [outputDir, setOutputDir] = useState('/var/lib/print-agent/previews');
  const [configPath, setConfigPath] = useState(
    '/etc/print-agent/print-agent.json',
  );
  const draft = {
    printerId,
    driverType,
    devicePath,
    address,
    outputDir,
    configPath,
  };
  const result = generateAgentConfigTemplate(
    draft,
    window.location.origin,
    agentToken,
  );
  const errors = result.ok ? {} : result.errors;

  const download = () => {
    if (!result.ok) return;
    const objectURL = URL.createObjectURL(
      new Blob([result.configJson], { type: 'application/json' }),
    );
    const link = document.createElement('a');
    link.href = objectURL;
    link.download = 'print-agent.json';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(objectURL), 0);
  };

  return (
    <details className="rounded-md border p-3">
      <summary className="cursor-pointer font-medium">設定テンプレート</summary>
      <div className="mt-3 grid gap-3">
        <div className="grid gap-2">
          <label className="grid gap-1" htmlFor={`${id}-driver`}>
            ドライバー
            <select
              id={`${id}-driver`}
              className="min-h-11 rounded-md border border-input bg-background px-3 text-sm"
              value={driverType}
              onChange={(event) =>
                setDriverType(event.target.value as AgentDriverType)
              }
            >
              <option value="tm-t88v-usb">TM-T88V USB</option>
              <option value="escpos-tcp">ESC/POS TCP</option>
              <option value="json-file">JSON ファイル（プレビュー）</option>
            </select>
          </label>
          {driverType === 'tm-t88v-usb' && (
            <label className="grid gap-1" htmlFor={`${id}-device-path`}>
              デバイスパス
              <input
                id={`${id}-device-path`}
                className="min-h-11 rounded-md border border-input bg-background px-3 text-sm"
                value={devicePath}
                onChange={(event) => setDevicePath(event.target.value)}
                aria-invalid={errors.devicePath !== undefined}
                aria-describedby={
                  errors.devicePath === undefined ? undefined : `${id}-errors`
                }
              />
            </label>
          )}
          {driverType === 'escpos-tcp' && (
            <label className="grid gap-1" htmlFor={`${id}-address`}>
              プリンターアドレス (host:port)
              <input
                id={`${id}-address`}
                className="min-h-11 rounded-md border border-input bg-background px-3 text-sm"
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                aria-invalid={errors.address !== undefined}
                aria-describedby={
                  errors.address === undefined ? undefined : `${id}-errors`
                }
              />
            </label>
          )}
          {driverType === 'json-file' && (
            <label className="grid gap-1" htmlFor={`${id}-output-dir`}>
              プレビュー出力先
              <input
                id={`${id}-output-dir`}
                className="min-h-11 rounded-md border border-input bg-background px-3 text-sm"
                value={outputDir}
                onChange={(event) => setOutputDir(event.target.value)}
                aria-invalid={errors.outputDir !== undefined}
                aria-describedby={
                  errors.outputDir === undefined ? undefined : `${id}-errors`
                }
              />
            </label>
          )}
          <label className="grid gap-1" htmlFor={`${id}-config-path`}>
            設定 JSON の保存先（絶対パス）
            <input
              id={`${id}-config-path`}
              className="min-h-11 rounded-md border border-input bg-background px-3 text-sm"
              value={configPath}
              onChange={(event) => setConfigPath(event.target.value)}
              aria-invalid={errors.configPath !== undefined}
              aria-describedby={
                errors.configPath === undefined ? undefined : `${id}-errors`
              }
            />
          </label>
          {!result.ok && (
            <div id={`${id}-errors`} role="alert" aria-live="assertive">
              {Object.values(result.errors).map((message) => (
                <p key={message}>{message}</p>
              ))}
            </div>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          command
          ドライバーは任意のプログラムを実行するため、ここでは生成できません。設定は{' '}
          <a
            className="underline"
            href={`${AGENT_SETUP_LINKS.agentReadme}#configuration`}
            target="_blank"
            rel="noreferrer"
          >
            エージェントの README
          </a>
          を参照してください。
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={!result.ok}
            onClick={download}
          >
            設定テンプレートをダウンロード
          </Button>
          {result.ok && (
            <CopyTextButton
              text={result.configJson}
              label="設定 JSON をコピー"
            />
          )}
        </div>
        {result.ok && (
          <>
            <figure
              className="grid gap-2"
              aria-labelledby={`${id}-config-preview-label`}
            >
              <figcaption
                id={`${id}-config-preview-label`}
                className="font-medium"
              >
                print-agent.json
              </figcaption>
              <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-md bg-muted p-3 text-xs">
                {result.configJson}
              </pre>
            </figure>
            <figure
              className="grid gap-2"
              aria-labelledby={`${id}-environment-preview-label`}
            >
              <figcaption
                id={`${id}-environment-preview-label`}
                className="font-medium"
              >
                環境変数ファイルの雛形
              </figcaption>
              <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-md bg-muted p-3 text-xs">
                {result.envText}
              </pre>
              <CopyTextButton text={result.envText} label="環境変数をコピー" />
              <p className="text-sm text-muted-foreground">
                トークンは JSON
                に含めません。環境変数ファイルは他人が読めないように保護してください。
              </p>
            </figure>
          </>
        )}
      </div>
    </details>
  );
}

export function CopyTextButton({
  text,
  label,
}: {
  text: string;
  label: string;
}) {
  const [status, setStatus] = useState('');
  const copy = () => {
    if (navigator.clipboard === undefined) {
      setStatus('このブラウザーではコピーできません。');
      return;
    }
    void navigator.clipboard.writeText(text).then(
      () => setStatus('コピーしました。'),
      () => setStatus('コピーできませんでした。権限を確認してください。'),
    );
  };

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button type="button" variant="outline" onClick={copy}>
        {label}
      </Button>
      <span role="status" aria-live="polite">
        {status}
      </span>
    </span>
  );
}
