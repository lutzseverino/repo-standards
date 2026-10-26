import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const site = fileURLToPath(new URL("../", import.meta.url));
const workflow = parse(
  readFileSync(
    new URL("../../.github/workflows/deploy-site.yml", import.meta.url),
    "utf8",
  ),
) as {
  on: { push: unknown; schedule: unknown };
  concurrency: { group: string; "cancel-in-progress": boolean };
  jobs: {
    build: {
      "timeout-minutes": number;
      steps: {
        name?: string;
        run?: string;
        uses?: string;
        env?: Record<string, string>;
        with?: { path: string };
        "continue-on-error"?: boolean;
      }[];
    };
    deploy: { needs: string; if?: string };
  };
};

test("each Pages build consumes its own count output; failed counting skips build, upload and deployment", () => {
  const steps = workflow.jobs.build.steps;
  const countStep = steps.find(
    (step) =>
      step.name === "Count this run's public adopters and build the site",
  )!;
  assert.ok(workflow.on.push && workflow.on.schedule);
  assert.deepEqual(workflow.concurrency, {
    group: "github-pages",
    "cancel-in-progress": false,
  });
  assert.ok(workflow.jobs.build["timeout-minutes"] > 15);
  assert.equal(countStep.env?.GH_TOKEN, "${{ github.token }}");
  assert.equal(countStep["continue-on-error"], undefined);
  assert.equal(workflow.jobs.deploy.needs, "build");
  assert.equal(workflow.jobs.deploy.if, undefined);
  assert.equal(steps.at(-1)?.with?.path, "site/dist");
  assert.ok(
    steps.findIndex((step) => step === countStep) <
      steps.findIndex((step) =>
        step.uses?.startsWith("actions/upload-pages-artifact@"),
      ),
  );
  assert.ok(
    !steps.some((step) => /cache|download-artifact/.test(step.uses ?? "")),
  );

  const directory = mkdtempSync(
    path.join(site, "node_modules/.adopter-workflow-"),
  );
  try {
    const bin = path.join(directory, "bin");
    mkdirSync(bin);
    const trace = path.join(directory, "build.json");
    const live = path.join(directory, "live.html");
    writeFileSync(live, "previously live site");
    // Replace only the expensive build command. The workflow's real shell
    // and real count producer run; the consumer checks the actual JSON.
    writeFileSync(
      path.join(bin, "pnpm"),
      `#!/bin/sh\nexec node --input-type=module <<'NODE'\nimport {readFileSync,writeFileSync} from 'node:fs';\nimport {readCounts} from ${JSON.stringify(new URL("../src/lib/adopter-counts.ts", import.meta.url).href)};\nconst file=process.env.SITE_ADOPTER_COUNTS;\nconst counts=readCounts(JSON.parse(readFileSync(file,'utf8')), {run:process.env.GITHUB_RUN_ID, attempt:process.env.GITHUB_RUN_ATTEMPT});\nwriteFileSync(process.env.BUILD_TRACE, JSON.stringify({file,counts}));\nNODE\n`,
      { mode: 0o755 },
    );
    let deployments = 0;
    let uploads = 0;
    const paths: string[] = [];
    const execute = (run: string, recording: string) => {
      const result = spawnSync("bash", ["-e", "-c", countStep.run!], {
        cwd: site,
        env: {
          ...process.env,
          PATH: `${bin}${path.delimiter}${process.env.PATH}`,
          RUNNER_TEMP: directory,
          GITHUB_RUN_ID: run,
          GITHUB_RUN_ATTEMPT: "1",
          SITE_SEARCH_RECORDING: recording,
          BUILD_TRACE: trace,
        },
        encoding: "utf8",
      });
      if (result.status === 0) {
        uploads++;
        deployments++;
        writeFileSync(live, `site from run ${run}`);
        const built = JSON.parse(readFileSync(trace, "utf8")) as {
          file: string;
          counts: Record<string, number>;
        };
        paths.push(built.file);
        assert.deepEqual(built.counts, {
          "lutzseverino/repo-canon": 1,
          "lutzseverino/repo-standards-example": 2,
        });
        assert.ok(
          !existsSync(built.file),
          "per-run JSON is deleted after the step",
        );
      }
      return result;
    };
    assert.equal(execute("100", path.join(site, "fixtures/search")).status, 0);
    assert.equal(execute("101", path.join(site, "fixtures/search")).status, 0);
    assert.notEqual(paths[0], paths[1]);
    const previous = readFileSync(live, "utf8");
    const previousBuild = readFileSync(trace, "utf8");
    const broken = path.join(directory, "broken");
    mkdirSync(broken);
    copyFileSync(
      path.join(site, "fixtures/search/page-1.json"),
      path.join(broken, "page-1.json"),
    );
    const failed = execute("102", broken);
    assert.notEqual(failed.status, 0);
    assert.match(failed.stderr, /adoptions.json/);
    assert.equal(
      readFileSync(trace, "utf8"),
      previousBuild,
      "build was not invoked on counting failure",
    );
    assert.equal(uploads, 2, "failed build cannot upload");
    assert.equal(deployments, 2, "deploy needs the successful build job");
    assert.equal(
      readFileSync(live, "utf8"),
      previous,
      "previously live site is unchanged",
    );
    assert.ok(
      !readdirSync(directory).some((file) =>
        file.startsWith("public-adopters."),
      ),
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
