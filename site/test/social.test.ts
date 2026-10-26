import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { defaultSocialImage } from "../src/lib/social-image.ts";

const read = (file: string) =>
  readFileSync(new URL(`../public${file}`, import.meta.url));

/** A PNG's width and height, from its header chunk. */
function pngSize(png: Buffer) {
  assert.deepEqual(
    [...png.subarray(0, 8)],
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  );
  assert.equal(png.toString("latin1", 12, 16), "IHDR");
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

test("the default social image is a 1200x630 PNG", () => {
  const image = defaultSocialImage("en");
  assert.deepEqual(pngSize(read(image.src)), {
    width: 1200,
    height: 630,
  });
  assert.equal(image.width, 1200);
  assert.equal(image.height, 630);
});

test("the web manifest names the site and lists its icons at their sizes", () => {
  const manifest = JSON.parse(read("/site.webmanifest").toString("utf8")) as {
    name: string;
    short_name: string;
    start_url: string;
    display: string;
    theme_color: string;
    background_color: string;
    icons: { src: string; sizes: string; type: string }[];
  };
  assert.equal(manifest.name, "Repo Standards");
  assert.equal(manifest.short_name, "Repo Standards");
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.display, "browser");
  // the sign palette: Verkehrsblau and the day page
  assert.equal(manifest.theme_color, "#0b4c96");
  assert.equal(manifest.background_color, "#f3f4f2");
  assert.deepEqual(
    manifest.icons.map((icon) => icon.src),
    ["/icon-192.png", "/icon-512.png"],
  );
  for (const icon of manifest.icons) {
    assert.equal(icon.type, "image/png");
    const { width, height } = pngSize(read(icon.src));
    assert.equal(icon.sizes, `${width}x${height}`);
  }
});
