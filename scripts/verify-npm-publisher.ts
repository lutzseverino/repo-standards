// Exercise npm's public OIDC exchange from the same workflow/environment as
// publication. Credentials stay in memory; never print response bodies/errors.
// This verifies authentication only, not permission to publish or provenance.
async function request(url: URL, options: RequestInit, status: number, phase: string) {
  let response: Response;
  try {
    response = await fetch(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(30_000) });
  } catch {
    throw new Error(`${phase}: request failed`);
  }
  if (response.status !== status) throw new Error(`${phase}: HTTP ${response.status}`);
  try {
    return await response.json() as Record<string, unknown>;
  } catch {
    throw new Error(`${phase}: invalid JSON response`);
  }
}

try {
  const { ACTIONS_ID_TOKEN_REQUEST_URL: endpoint, ACTIONS_ID_TOKEN_REQUEST_TOKEN: credential } = process.env;
  if (process.env.GITHUB_ACTIONS !== 'true' || !endpoint || !credential) {
    throw new Error('Run in GitHub Actions with id-token: write and the npm environment');
  }
  const url = new URL(endpoint);
  if (url.protocol !== 'https:') throw new Error('GitHub OIDC endpoint must use HTTPS');
  url.searchParams.set('audience', 'npm:registry.npmjs.org');
  const identity = await request(url, {
    headers: { Authorization: `Bearer ${credential}`, Accept: 'application/json' },
  }, 200, 'GitHub OIDC');
  if (typeof identity.value !== 'string' || !identity.value) throw new Error('GitHub OIDC: missing token');
  const exchange = await request(new URL(
    'https://registry.npmjs.org/-/npm/v1/oidc/token/exchange/package/@lutzseverino%2Frepo-standards',
  ), { method: 'POST', headers: { Authorization: `Bearer ${identity.value}` } }, 201, 'npm OIDC exchange');
  if (exchange.token_type !== 'oidc' || typeof exchange.token !== 'string' || !exchange.token) {
    throw new Error('npm OIDC exchange: missing token or unexpected token type');
  }
  console.log('Trusted publisher OIDC exchange passed for @lutzseverino/repo-standards. No package published.');
} catch (error) {
  // Only locally constructed messages are allowed out; malformed endpoint URLs
  // and unexpected runtime errors must not disclose input or response contents.
  const message = error instanceof Error ? error.message : '';
  const safe = /^(?:Run in GitHub Actions with id-token: write and the npm environment|GitHub OIDC endpoint must use HTTPS|(?:GitHub OIDC|npm OIDC exchange): (?:request failed|HTTP \d{3}|invalid JSON response|missing token|missing token or unexpected token type))$/;
  console.error(safe.test(message) ? message : 'Trusted publisher verification failed');
  process.exitCode = 1;
}
