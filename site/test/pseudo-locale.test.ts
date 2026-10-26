// The pseudo-locale in Astro's development server: every page renders in it,
// from the catalogs, with its own `<html lang>` and links that stay in it.
import assert from "node:assert/strict";
import path from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { dev } from "astro";
import {
  parseTranslations,
  readTranslationFiles,
} from "../src/i18n/translations.ts";
import { loadCatalogue } from "../src/lib/load-catalogue.ts";

const site = fileURLToPath(new URL("../", import.meta.url));
let server: Awaited<ReturnType<typeof dev>>;
let base = "";
const page = async (pathname: string) => {
  const response = await fetch(new URL(pathname, base));
  assert.equal(response.status, 200, `${pathname} renders`);
  return response.text();
};

before(async () => {
  process.env.SITE_SEARCH_RECORDING = path.join(site, "fixtures/search");
  server = await dev({
    root: site,
    logLevel: "error",
    server: { host: "127.0.0.1", port: 0 },
  });
  base = `http://127.0.0.1:${server.address.port}`;
});

after(() => server.stop());

async function pseudoPages() {
  const { sources } = await loadCatalogue();
  return [
    "/en-xa/",
    "/en-xa/how-it-works/",
    ...sources.map((source) => `/en-xa/sources/${source.repository}/`),
  ];
}

test("every page renders in the pseudo-locale in development, with no raw message IDs", async () => {
  const ids = Object.keys(
    parseTranslations(readTranslationFiles(path.join(site, "src/i18n"))).en
      .messages,
  );
  for (const pathname of await pseudoPages()) {
    const html = await page(pathname);
    assert.match(html, /<html lang="en-XA">/, pathname);
    assert.match(html, /⟦[^⟧]+⟧/, `${pathname} shows pseudo-localized text`);
    // an island's props key its finished strings by ID
    const rendered = html.replace(/ props="[^"]*"/g, "");
    for (const id of ids)
      assert.ok(!rendered.includes(id), `${pathname} shows the raw ID ${id}`);
  }
});

test("the pseudo-locale's pages link to each other, and the default locale stays at the root", async () => {
  const home = await page("/en-xa/");
  assert.match(home, /href="\/en-xa\/how-it-works\/"/);
  assert.match(home, /href="\/en-xa\/sources\/lutzseverino\/repo-canon\/"/);
  const source = await page("/en-xa/sources/lutzseverino/repo-canon/");
  assert.match(source, /href="\/en-xa\/"/);
  assert.match(await page("/en-xa/how-it-works/"), /href="\/en-xa\/"/);
  const root = await page("/");
  assert.match(root, /<html lang="en">/);
  assert.doesNotMatch(root, /⟦|\/en-xa\//);
});
