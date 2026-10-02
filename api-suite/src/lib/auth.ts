import { AuthConfig, ClientConfig } from '../types';

/** Reads an env var required for a client's config, failing loudly (never
 * silently) if it's missing — a blank/undefined credential should never
 * turn into an unauthenticated request. */
function requireEnv(varName: string, clientId: string): string {
  const value = process.env[varName];
  if (!value) {
    throw new Error(
      `Missing env var "${varName}" required by client "${clientId}". Set it in .env (see .env.example).`
    );
  }
  return value;
}

export function resolveBaseUrl(client: ClientConfig): string {
  return requireEnv(client.baseUrlEnv, client.id);
}

/** Builds the auth headers for a client from its `auth` config + env vars. */
export function buildAuthHeaders(client: ClientConfig): Record<string, string> {
  const auth: AuthConfig = client.auth;
  switch (auth.type) {
    case 'bearer':
      return { Authorization: `Bearer ${requireEnv(auth.tokenEnv, client.id)}` };
    case 'apiKey':
      return { [auth.headerName]: requireEnv(auth.apiKeyEnv, client.id) };
    case 'basic': {
      const username = requireEnv(auth.usernameEnv, client.id);
      const password = requireEnv(auth.passwordEnv, client.id);
      const encoded = Buffer.from(`${username}:${password}`).toString('base64');
      return { Authorization: `Basic ${encoded}` };
    }
    case 'otp':
      // Resolved asynchronously, so it cannot be produced here. httpClient
      // fetches it via cachedOtpLogin before building the request.
      return {};
    case 'none':
      return {};
  }
}

/** True when this client mints its token per run rather than reading one from
 * the environment. */
export function needsOtpLogin(client: ClientConfig): boolean {
  return client.auth.type === 'otp';
}
