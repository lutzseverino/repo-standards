import { execFileSync } from "node:child_process";
import { after, test } from "node:test";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { installCli } from "./installed-cli.ts";
import { processPath } from "./process-path.ts";

const cli = installCli();
after(() => cli.close());
const dist = join(cli.root, "node_modules/@lutzseverino/repo-standards/dist");
function run(script: string, env: NodeJS.ProcessEnv) {
  execFileSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { invoke } from ${JSON.stringify(pathToFileURL(join(dist, "execution.js")).href)};
import { processGroupAlive, processIdentity } from ${JSON.stringify(pathToFileURL(join(dist, "run-lock.js")).href)};
${script}`,
    ],
    { env, stdio: "pipe", timeout: 10_000 },
  );
}

test("shared execution retains a census failure separately from the author's exit and output", (t) => {
  const bin = processPath(t);
  bin.failPs('console.error("shared census denied"); process.exit(23);');
  run(
    `const result = await invoke(process.execPath, ['-e', 'console.log("author output"); process.exit(7)'], process.cwd(), 2, '');
assert.deepEqual(result.outcome, {exitCode:7,signal:null,error:'PROCESS_STATE',timedOut:false});
assert.equal(result.stdout, 'author output\\n');
assert.equal(result.stderr, '');
assert.equal(result.stateError.code, 'PROCESS_STATE');
assert.match(result.stateError.message, /exit status 23.*shared census denied/s);
assert.equal(result.stateError.details.exitCode, 23);
assert.equal(result.stateError.details.stderr, 'shared census denied\\n');`,
    bin.env,
  );
});

test("shared execution distinguishes an unreadable group from an exited probe with real ps", (t) => {
  const bin = processPath(t);
  run(
    `const result = await invoke(process.execPath, ['--version'], process.cwd(), 2, '');
assert.equal(result.outcome.exitCode, 0);
assert.equal(result.outcome.error, 'PROCESS_STATE');
assert.equal(result.stateError.details.error.code, 'ENOENT');`,
    bin.env,
  );
  bin.restorePs();
  run(
    `let group;
const result = await invoke(process.execPath, ['--version'], process.cwd(), 2, '', pid => group = pid);
assert.deepEqual(result.outcome, {exitCode:0,signal:null,error:null,timedOut:false});
assert.equal(result.stateError, undefined);
assert.equal(processGroupAlive(group), false);`,
    bin.env,
  );
});

test("group census still ignores zombies and protects against leader identity reuse", (t) => {
  const bin = processPath(t);
  bin.failPs('console.log("123 Z\\n123 Z+\\n456 S");');
  run(
    `assert.equal(processGroupAlive(123), false);
assert.equal(processGroupAlive(456), true);
const leader = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {detached:true,stdio:'ignore'});
try {
  assert.equal(typeof processIdentity(leader.pid), 'string');
  assert.equal(processGroupAlive(leader.pid, 'another-start-identity'), false);
} finally {
  leader.kill('SIGKILL');
  await new Promise(resolve => leader.on('close', resolve));
}`,
    bin.env,
  );
});
