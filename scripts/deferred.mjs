const deferred = {
  'test:e2e': 'E2EテストはPhase 9で実装します。',
  'db:diff': 'Atlasマイグレーション設定はPhase 3で実装します。',
  'db:validate': 'Atlasマイグレーション検証はPhase 3で実装します。',
  'db:migrate': 'Atlasマイグレーション適用はPhase 3で実装します。',
  'db:status': 'Atlasマイグレーション状態確認はPhase 3で実装します。',
};

const command = process.argv[2];
const reason = deferred[command];
if (!reason) {
  console.error(`未実装コマンドです: ${command ?? '(missing)'}`);
  process.exitCode = 2;
} else {
  console.error(`${command}: 後続フェーズで実装します。${reason}`);
  process.exitCode = 1;
}
