import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { remoteFixture } from "./remote-fixture.ts";

export interface HttpResponse {
  body: unknown;
  status?: number;
  headers?: Record<string, string>;
  reflectToken?: boolean;
  malformed?: boolean;
  disconnect?: boolean;
}

// Real local HTTP boundaries for REST, redirects, and anonymous Git smart
// protocol. Tokens live only in process environments and request headers;
// recorded requests retain comparisons, never credential values.
export async function githubFixture(
  yaml: string,
  files: Record<string, string>,
  tokens: NodeJS.ProcessEnv,
) {
  const remote = remoteFixture(yaml, files);
  const script = join(remote.support.root, "github-server.mjs");
  const requests = join(remote.support.root, "http-requests.jsonl");
  writeFileSync(requests, "");
  writeFileSync(
    script,
    `import { createServer } from 'node:http';
import { appendFileSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { basename, dirname } from 'node:path';
const source = ${JSON.stringify(remote.source.root)};
const server = createServer(async (req, res) => {
  const authorization = req.headers.authorization;
  const kind = req.url.startsWith('/git/') ? 'git' : 'rest';
  appendFileSync(${JSON.stringify(requests)}, JSON.stringify({
    path: req.url, kind, authorized: authorization !== undefined,
    matchesGh: !!process.env.GH_TOKEN && authorization === 'Bearer ' + process.env.GH_TOKEN,
    matchesGithub: !!process.env.GITHUB_TOKEN && authorization === 'Bearer ' + process.env.GITHUB_TOKEN,
    accept: req.headers.accept, apiVersion: req.headers['x-github-api-version'], userAgent: req.headers['user-agent']
  }) + '\\n');
  if (kind === 'git') {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const url = new URL(req.url, 'http://localhost');
    const output = execFileSync('git', ['http-backend'], {
      input: Buffer.concat(chunks), maxBuffer: 16 * 1024 * 1024,
      env: {...process.env, GIT_PROJECT_ROOT: dirname(source), GIT_HTTP_EXPORT_ALL: '1',
        PATH_INFO: '/' + basename(source) + url.pathname.slice('/git'.length),
        QUERY_STRING: url.search.slice(1), REQUEST_METHOD: req.method,
        CONTENT_TYPE: req.headers['content-type'] ?? '', HTTP_GIT_PROTOCOL: req.headers['git-protocol'] ?? ''}
    });
    const split = output.indexOf('\\r\\n\\r\\n');
    for (const line of output.subarray(0, split).toString().split('\\r\\n')) {
      const colon = line.indexOf(':');
      if (line.startsWith('Status:')) res.statusCode = Number(line.slice(colon + 1).trim().split(' ')[0]);
      else res.setHeader(line.slice(0, colon), line.slice(colon + 1).trim());
    }
    res.end(output.subarray(split + 4));
    return;
  }
  const entries = JSON.parse(readFileSync(${JSON.stringify(join(remote.support.root, "responses.json"))}, 'utf8'));
  const entry = entries['https://api.github.com' + req.url];
  if (!entry) { res.writeHead(500); res.end(); return; }
  if (entry.disconnect) { req.socket.destroy(); return; }
  res.writeHead(entry.status ?? 200, entry.headers);
  const body = entry.reflectToken ? {message: 'Rejected ' + process.env.GH_TOKEN + ' ' + process.env.GITHUB_TOKEN} : entry.body;
  res.end(entry.malformed ? 'Invalid ' + process.env.GH_TOKEN + ' ' + process.env.GITHUB_TOKEN : JSON.stringify(body));
});
server.listen(0, '127.0.0.1', () => console.log(server.address().port));
process.stdin.on('end', () => process.exit()).resume();
`,
  );
  const server = spawn(process.execPath, [script], {
    env: { ...process.env, GH_TOKEN: "", GITHUB_TOKEN: "", ...tokens },
    stdio: ["pipe", "pipe", "pipe"],
  });
  const port = await new Promise<string>((resolve, reject) => {
    server.stdout.once("data", (data) => resolve(String(data).trim()));
    server.once("error", reject);
    server.once("exit", (code) =>
      reject(new Error(`HTTP fixture exited: ${code}`)),
    );
  });
  const origin = `http://127.0.0.1:${port}`;
  const loader = join(remote.support.root, "local-http.mjs");
  writeFileSync(
    loader,
    `const unmocked = globalThis.fetch;
globalThis.fetch = (url, init) => {
  if (!String(url).startsWith('https://api.github.com/')) return unmocked(url, init);
  return unmocked(${JSON.stringify(origin)} + new URL(url).pathname + new URL(url).search, init);
};
`,
  );
  return {
    ...remote,
    origin,
    responses: remote.responses as Record<string, HttpResponse>,
    requestFile: requests,
    env: {
      ...remote.env,
      NODE_OPTIONS: `--import=${pathToFileURL(loader).href}`,
      GIT_CONFIG_KEY_0: `url.${origin}/git.insteadOf`,
      GIT_CONFIG_VALUE_0: `https://github.com/${remote.repository}`,
    },
    close() {
      server.kill();
      remote.close();
    },
  };
}
