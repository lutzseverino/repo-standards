import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { build, createServer } from "vite";
import { dev } from "astro";
import { prepaint } from "../src/lib/prepaint.ts";

const site = fileURLToPath(new URL("../", import.meta.url));

test("Astro development pages inline all pre-paint entries as classic scripts", async () => {
  process.env.SITE_SEARCH_RECORDING = path.join(site, "fixtures/search");
  const server = await dev({
    root: site,
    logLevel: "error",
    server: { host: "127.0.0.1", port: 0 },
    devToolbar: { enabled: false },
  });
  try {
    for (const [route, entries] of [
      ["/", ["localeChoice", "themes", "sinkPosts"]],
      ["/docs/", ["themes"]],
    ] as const) {
      const response = await fetch(
        `http://127.0.0.1:${server.address.port}${route}`,
      );
      assert.equal(response.status, 200);
      const html = await response.text();
      const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(
        (match) => match[1],
      );
      for (const entry of entries) {
        const script = scripts.find((code) =>
          code.includes(`function ${entry}`),
        );
        assert.ok(script, `${route}: ${entry}`);
        assert.match(script, /^\(function\(\)\{/);
        assert.doesNotMatch(script, /\b(?:import|export)\b/);
      }
    }
  } finally {
    await server.stop();
  }
});

test("a prepaint query bundles imported dependencies into an inline classic script in dev and build", async () => {
  const root = mkdtempSync(path.join(site, "node_modules/.prepaint-"));
  try {
    writeFileSync(
      path.join(root, "value.ts"),
      'export const value: string = "before paint";',
    );
    writeFileSync(
      path.join(root, "entry.ts"),
      'import { value } from "./value"; document.title = value;',
    );
    writeFileSync(
      path.join(root, "consumer.ts"),
      'import script from "./entry.ts?prepaint"; export default script;',
    );
    const server = await createServer({
      configFile: false,
      root,
      plugins: [prepaint()],
      server: { middlewareMode: true, watch: null },
    });
    try {
      const { default: script } = (await server.ssrLoadModule(
        "/consumer.ts",
      )) as { default: string };
      check(script);
    } finally {
      await server.close();
    }
    const result = await build({
      configFile: false,
      root,
      plugins: [prepaint()],
      logLevel: "error",
      build: {
        write: false,
        lib: { entry: path.join(root, "consumer.ts"), formats: ["es"] },
      },
    });
    const bundle = Array.isArray(result) ? result[0] : result;
    assert.ok("output" in bundle);
    const chunk = bundle.output[0];
    assert.equal(chunk.type, "chunk");
    if (chunk.type !== "chunk") return;
    const { default: script } = (await import(
      `data:text/javascript,${encodeURIComponent(chunk.code)}`
    )) as { default: string };
    check(script);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function check(script: string) {
  assert.doesNotMatch(script, /\b(?:import|export)\b/);
  assert.equal(script.trim().split("\n").length, 1);
  const document = { title: "" };
  vm.runInNewContext(script, { document });
  assert.equal(document.title, "before paint");
}
