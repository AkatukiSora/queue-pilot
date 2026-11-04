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

## 結果

provider固有のcallbackとprofile変換はinfrastructure adapterに閉じ、applicationへは検証済みの`{userId, issuer, subject}`だけを渡す。実IdP設定、公開設定、運用切替は別途承認する。GitHub OAuthとGeneric OIDCは別プロトコルとして検証し、GitHub OAuthの試験結果をOIDC適合性の証明に流用しない。
