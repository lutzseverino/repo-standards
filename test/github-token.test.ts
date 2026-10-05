import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, test } from "node:test";
import { fixtureFiles, installCli, sourceFixture } from "./installed-cli.ts";
import { githubFixture } from "./github-fixture.ts";
import { commit, inspectionArgs, manifest } from "./remote-fixture.ts";
import type { Inspection } from "./json-reports.ts";

const cli = installCli();
after(() => cli.close());
const tokens = {
  GH_TOKEN: "sentinel-gh-205-do-not-record",
  GITHUB_TOKEN: "sentinel-github-205-do-not-record",
};
const yaml = manifest({
  readme: { kind: "file", target: "README.md", exact: "readme.md" },
});

interface Request {
  path: string;
  kind: "rest" | "git";
  authorized: boolean;
  matchesGh: boolean;
  matchesGithub: boolean;
  accept?: string;
  apiVersion?: string;
  userAgent?: string;
}

function requests(remote: Awaited<ReturnType<typeof githubFixture>>) {
  return readFileSync(remote.requestFile, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Request);
}

function noTokens(outputs: string[], roots: string[]) {
  for (const token of Object.values(tokens)) {
    for (const output of outputs)
      assert.equal(output.includes(token), false, "Credential in CLI output");
    for (const root of roots) {
      for (const [path, bytes] of Object.entries(fixtureFiles(root))) {
        assert.equal(path.includes(token), false, "Credential in filename");
        assert.equal(bytes.includes(token), false, `Credential in ${path}`);
      }
    }
  }
}

test("inspection authenticates every REST endpoint, keeps Git anonymous, and preserves identity without storing tokens", async (t) => {
  const remote = await githubFixture(yaml, { "readme.md": "README" }, tokens);
  const project = sourceFixture("");
  t.after(() => {
    remote.close();
    project.close();
  });
  commit(project.root);
  const annotation = "a".repeat(40);
  remote.responses[`${remote.prefix}/git/ref/tags/v1.0.0`] = {
    body: { ref: "refs/tags/v1.0.0", object: { type: "tag", sha: annotation } },
  };
  remote.responses[`${remote.prefix}/git/tags/${annotation}`] = {
    body: { object: { type: "commit", sha: remote.sha } },
  };
  remote.save();
  let identity: string | undefined;
  const outputs: string[] = [];
  for (const [env, expected] of [
    [{}, "absent"],
    [{ GH_TOKEN: "", GITHUB_TOKEN: "" }, "absent"],
    [{ GH_TOKEN: tokens.GH_TOKEN }, "gh"],
    [{ GITHUB_TOKEN: tokens.GITHUB_TOKEN }, "github"],
    [{ GH_TOKEN: "", GITHUB_TOKEN: tokens.GITHUB_TOKEN }, "github"],
    [tokens, "gh"],
  ] as const) {
    const before = requests(remote).length;
    const result = cli.run(inspectionArgs, project.root, {
      ...remote.env,
      ...env,
    });
    outputs.push(result.stdout, result.stderr);
    assert.equal(result.status, 0, "Inspection succeeds");
    const report = JSON.parse(result.stdout) as Inspection;
    identity ??= report.identity;
    assert.equal(report.identity, identity);
    const observed = requests(remote).slice(before);
    const rest = observed.filter((request) => request.kind === "rest");
    assert.equal(rest.length, 5);
    for (const request of rest) {
      assert.equal(request.authorized, expected !== "absent");
      assert.equal(request.matchesGh, expected === "gh");
      assert.equal(request.matchesGithub, expected === "github");
      assert.equal(request.accept, "application/vnd.github+json");
      assert.equal(request.apiVersion, "2022-11-28");
      assert.equal(request.userAgent, "repo-standards");
    }
    const git = observed.filter((request) => request.kind === "git");
    assert.ok(git.length > 0);
    assert.ok(git.every((request) => !request.authorized));
  }
  noTokens(outputs, [project.root, remote.support.root, remote.env.TMPDIR]);
});
