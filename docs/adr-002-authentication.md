# ADR-002: 交換可能な認証とローカル認可

状態: 採用

## 背景

共有Bearer tokenでは利用者ごとの失効、tenant membership、role認可を提供できない。認証方式はアプリケーションの業務ロジックから分離し、providerを変更しても同じPrincipalとローカル認可契約を使う。

## 決定

`AuthenticationPort`を境界とし、初期adapterにGitHub OAuth 2.0を使う。GitHubはOIDC issuerではないため、OIDCの`id_token`やnonce検証をGitHubログインに要求したり、GitHub OAuthをOIDCとして扱ったりしない。GitHubの不変な数値ユーザーIDをprovider subjectとして保存し、login名とemailはidentity keyに使わない。同じemailを持つ別GitHubアカウントは別subjectとして扱い、自動linkしない。

Generic OIDC adapterも同じ`AuthenticationPort`の契約を実装する。OIDCではissuerと`sub`をidentity keyにし、discovery/JWKS、audience、署名、expiry、nonce、state、PKCEの検証を有効にする。providerは起動時設定で一つ選び、リクエストからissuerやproviderを動的に選ばせない。

## セッションと認可

- セッションはPostgreSQLに保存し、有効期間は900秒とする。cookie cacheやstateless JWT sessionを使わず、各requestでsession失効状態とmembershipを確認する。
- cookieは`Secure`、`HttpOnly`、`SameSite=Lax`とし、trusted originを固定する。cookieを使う更新操作はOrigin検査とCSRF保護を通す。
- tenantのadmin/staff membershipはローカルDBに保存し、ログインだけでmembershipを作らない。adminはticket運用とagent管理、staffはticket運用のみ許可する。member・role編集用HTTP APIは設けない。
- membershipの削除・無効化はmanifest applyで行い、同じtransactionで対象ユーザーのsessionを失効させる。次のrequestから拒否する。
- agent credentialは人間のsessionと分け、tenant/event/printerへ束縛した高entropy bearer tokenのSHA-256 hashのみを保存する。発行時だけ平文を返し、adminだけがrotate/revokeできる。
- `legacy-single` modeだけ既存Bearer tokenをdefault tenant/event向けに使える。shared modeでは旧admin/agent tokenへのfallbackを拒否する。

## Client IPと rate limit retention

shared modeはBetter Authのdatabase rate limit storageを使い、rate-limit行をPostgreSQLで共有する。`AUTH_TRUSTED_PROXIES`は任意のJSON IP/CIDR配列であり、設定値は起動時に検証する。未設定または空配列ではForwarded IP headerを読まず、unknown IPの共有bucketを使う。非空の場合だけ`X-Forwarded-For`を解析し、右端の明示trusted proxyを除いて最初のuntrusted hopをrate-limit keyにする。これはsocket peerのACLではないため、直接接続の遮断はingressとNetworkPolicyで別途保証する必要がある。

rate-limit行のhousekeepingは、60秒または静的plugin windowの最大値より古い行を起動時と定期実行で削除する。起動時cleanupが失敗した場合はAPIをlistenしない。定期cleanupが失敗した場合はreadinessをfalseにし、次の周期で再試行する。これは運用上の保持目標であり、DB停止・時計差・backup/WALによる厳密なTTLは保証しない。

## 結果

provider固有のcallbackとprofile変換はinfrastructure adapterに閉じ、applicationへは検証済みの`{userId, issuer, subject}`だけを渡す。実IdP設定、公開設定、運用切替は別途承認する。GitHub OAuthとGeneric OIDCは別プロトコルとして検証し、GitHub OAuthの試験結果をOIDC適合性の証明に流用しない。
