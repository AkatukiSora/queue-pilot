import {
  createHash,
  generateKeyPairSync,
  randomBytes,
  sign,
} from 'node:crypto';
import { createServer, type IncomingMessage } from 'node:http';

type PendingCode = {
  nonce: string | null;
  challenge: string | null;
  redirectUri: string;
};

const publicIssuer = process.env.MOCK_OIDC_PUBLIC_ISSUER;
const internalOrigin = process.env.MOCK_OIDC_INTERNAL_ORIGIN;
const clientId = process.env.MOCK_OIDC_CLIENT_ID;
const clientSecret = process.env.MOCK_OIDC_CLIENT_SECRET;
if (!publicIssuer || !internalOrigin || !clientId || !clientSecret) {
  throw new Error('Mock OIDC configuration is incomplete.');
}

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
const pendingCodes = new Map<string, PendingCode>();
const json = (
  response: import('node:http').ServerResponse,
  status: number,
  body: unknown,
) => {
  response.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  });
  response.end(JSON.stringify(body));
};
const readForm = async (request: IncomingMessage) => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
};
const base64Url = (value: Buffer | string) =>
  Buffer.from(value).toString('base64url');

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', internalOrigin);
  if (url.pathname === '/.well-known/openid-configuration') {
    json(response, 200, {
      issuer: publicIssuer,
      authorization_endpoint: `${publicIssuer}/authorize`,
      token_endpoint: `${internalOrigin}/token`,
      userinfo_endpoint: `${internalOrigin}/userinfo`,
      jwks_uri: `${internalOrigin}/jwks`,
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
    json(response, 200, { keys: [jwk] });
    return;
  }
  if (url.pathname === '/authorize') {
    const redirectUri = url.searchParams.get('redirect_uri');
    const state = url.searchParams.get('state');
    const challenge = url.searchParams.get('code_challenge');
    if (
      url.searchParams.get('client_id') !== clientId ||
      url.searchParams.get('response_type') !== 'code' ||
      redirectUri === null ||
      state === null
    ) {
      json(response, 400, { error: 'invalid_request' });
      return;
    }
    const code = randomBytes(24).toString('base64url');
    pendingCodes.set(code, {
      nonce: url.searchParams.get('nonce'),
      challenge,
      redirectUri,
    });
    const target = new URL(redirectUri);
    target.searchParams.set('code', code);
    target.searchParams.set('state', state);
    target.searchParams.set('iss', publicIssuer);
    response.writeHead(302, { Location: target.href });
    response.end();
    return;
  }
  if (url.pathname === '/token' && request.method === 'POST') {
    const form = await readForm(request);
    const authorization = request.headers.authorization;
    const basic = authorization?.startsWith('Basic ')
      ? Buffer.from(authorization.slice(6), 'base64')
          .toString('utf8')
          .split(':')
          .map(decodeURIComponent)
      : [form.get('client_id'), form.get('client_secret')];
    const code = form.get('code') ?? '';
    const pending = pendingCodes.get(code);
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
      json(response, 400, { error: 'invalid_grant' });
      return;
    }
    pendingCodes.delete(code);
    const issuedAt = Math.floor(Date.now() / 1000);
    const header = base64Url(
      JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: keyId }),
    );
    const payload = base64Url(
      JSON.stringify({
        iss: publicIssuer,
        sub: 'demo-admin',
        aud: clientId,
        iat: issuedAt,
        exp: issuedAt + 3600,
        ...(pending.nonce === null ? {} : { nonce: pending.nonce }),
        name: 'Demo operator',
        preferred_username: 'demo-admin',
      }),
    );
    const signature = sign(
      'sha256',
      Buffer.from(`${header}.${payload}`),
      privateKey,
    );
    json(response, 200, {
      access_token: randomBytes(24).toString('base64url'),
      token_type: 'Bearer',
      expires_in: 3600,
      scope: 'openid profile email',
      id_token: `${header}.${payload}.${base64Url(signature)}`,
    });
    return;
  }
  if (url.pathname === '/userinfo') {
    json(response, 200, { sub: 'demo-admin', name: 'Demo operator' });
    return;
  }
  json(response, 404, { error: 'not_found' });
});

server.listen(8080, '0.0.0.0');
