// Draws the social preview, `public/social.png`: the homepage's title plate
// by day, a Verkehrsblau sign on its two posts, set in D-DIN PRO. The text
// is outlined from the site's own WOFF2 fonts and kerned with their GPOS
// pairs, so the image renders the same on any machine, with no system fonts.
// Run `pnpm --dir site social-image` after changing the title, the
// positioning line or the sign palette.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { brotliDecompressSync } from "node:zlib";
import { create } from "fontkitten";
import sharp from "sharp";

const siteRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const output = path.join(siteRoot, "public/social.png");

// Open Graph's recommended size, and the day palette (src/styles/tokens.css,
// src/styles/global.css), at twice the homepage's scale.
const width = 1200;
const height = 630;
const page = "#f3f4f2";
const blue = "#0b4c96";
const ink = "#fff";
const title = "Repo Standards";
const line =
  "Write your setup down once. Your coding agent applies it to every repository.";

function fontFile(name) {
  const data = readFileSync(
    path.join(siteRoot, "public/fonts/d-din-pro", `${name}.woff2`),
  );
  return { font: create(data), kerning: kerning(gposTable(data)) };
}

/** The GPOS table's bytes from a WOFF2 file, or null when it has none. */
function gposTable(woff2) {
  // the tags a WOFF2 table directory entry names by index
  // prettier-ignore
  const knownTags = [
    "cmap", "head", "hhea", "hmtx", "maxp", "name", "OS/2", "post", "cvt ",
    "fpgm", "glyf", "loca", "prep", "CFF ", "VORG", "EBDT", "EBLC", "gasp",
    "hdmx", "kern", "LTSH", "PCLT", "VDMX", "vhea", "vmtx", "BASE", "GDEF",
    "GPOS", "GSUB",
  ];
  let pos = 48;
  const base128 = () => {
    let value = 0;
    for (;;) {
      const byte = woff2[pos++];
      value = value * 128 + (byte & 0x7f);
      if (!(byte & 0x80)) return value;
    }
  };
  const tables = [];
  for (let i = 0; i < woff2.readUInt16BE(12); i++) {
    const flags = woff2[pos++];
    const tag =
      (flags & 0x3f) === 0x3f
        ? woff2.toString("latin1", pos, (pos += 4))
        : knownTags[flags & 0x3f];
    const length = base128();
    const version = flags >> 6;
    const transformed =
      tag === "glyf" || tag === "loca" ? version === 0 : version !== 0;
    tables.push({ tag, length: transformed ? base128() : length });
  }
  const data = brotliDecompressSync(
    woff2.subarray(pos, pos + woff2.readUInt32BE(20)),
  );
  let offset = 0;
  for (const table of tables) {
    if (table.tag === "GPOS")
      return data.subarray(offset, offset + table.length);
    offset += table.length;
  }
  return null;
}

/** The kerning between two glyphs, in font units, from the GPOS `kern`
 * feature's pair adjustments: their first glyph's x advance. */
function kerning(gpos) {
  if (!gpos) return () => 0;
  const u16 = (at) => gpos.readUInt16BE(at);
  const coverage = (at, glyph) => {
    if (u16(at) === 1) {
      for (let i = 0; i < u16(at + 2); i++)
        if (u16(at + 4 + i * 2) === glyph) return i;
    } else {
      for (let i = 0; i < u16(at + 2); i++) {
        const range = at + 4 + i * 6;
        if (glyph >= u16(range) && glyph <= u16(range + 2))
          return u16(range + 4) + glyph - u16(range);
      }
    }
    return -1;
  };
  const glyphClass = (at, glyph) => {
    if (u16(at) === 1) {
      const index = glyph - u16(at + 2);
      return index >= 0 && index < u16(at + 4) ? u16(at + 6 + index * 2) : 0;
    }
    for (let i = 0; i < u16(at + 2); i++) {
      const range = at + 4 + i * 6;
      if (glyph >= u16(range) && glyph <= u16(range + 2)) return u16(range + 4);
    }
    return 0;
  };
  // a value record holds a 16-bit field for each bit of its format; the x
  // advance is the third, after the x and y placements
  const size = (format) => 2 * [...format.toString(2)].filter(Number).length;
  const xAdvance = (at, format) =>
    format & 4 ? gpos.readInt16BE(at + size(format & 3)) : 0;

  const features = u16(6);
  const lookups = u16(8);
  const subtables = [];
  for (let i = 0; i < u16(features); i++) {
    const record = features + 2 + i * 6;
    if (gpos.toString("latin1", record, record + 4) !== "kern") continue;
    const feature = features + u16(record + 4);
    for (let j = 0; j < u16(feature + 2); j++) {
      const lookup = lookups + u16(lookups + 2 + u16(feature + 4 + j * 2) * 2);
      for (let k = 0; k < u16(lookup + 4); k++) {
        let subtable = lookup + u16(lookup + 6 + k * 2);
        let type = u16(lookup);
        if (type === 9) {
          type = u16(subtable + 2);
          subtable += gpos.readUInt32BE(subtable + 4);
        }
        if (type === 2 && !subtables.includes(subtable))
          subtables.push(subtable);
      }
    }
  }

  return (first, second) => {
    for (const at of subtables) {
      const index = coverage(at + u16(at + 2), first);
      if (index < 0) continue;
      const format1 = u16(at + 4);
      const format2 = u16(at + 6);
      if (u16(at) === 1) {
        const set = at + u16(at + 10 + index * 2);
        const record = 2 + size(format1) + size(format2);
        for (let i = 0; i < u16(set); i++)
          if (u16(set + 2 + i * record) === second)
            return xAdvance(set + 4 + i * record, format1);
        continue;
      }
      const class1 = glyphClass(at + u16(at + 8), first);
      const class2 = glyphClass(at + u16(at + 10), second);
      const record = size(format1) + size(format2);
      return xAdvance(
        at + 16 + (class1 * u16(at + 14) + class2) * record,
        format1,
      );
    }
    return 0;
  };
}

/** A run of text set in `face` at `fontSize` px: its outline at the origin's
 * baseline and its width. */
function setText({ font, kerning }, fontSize, text) {
  const scale = fontSize / font.unitsPerEm;
  let x = 0;
  let previous = null;
  const paths = [];
  for (const character of text) {
    const glyph = font.glyphForCodePoint(character.codePointAt(0));
    if (previous) x += kerning(previous.id, glyph.id);
    const outline = glyph.path.toSVG();
    if (outline)
      paths.push(
        `<path transform="translate(${(x * scale).toFixed(2)} 0) scale(${scale} ${-scale})" d="${outline}"/>`,
      );
    x += glyph.advanceWidth;
    previous = glyph;
  }
  return { svg: paths.join(""), width: x * scale };
}

/** `text` broken into lines no wider than `maxWidth`. */
function wrap(face, fontSize, text, maxWidth) {
  const lines = [];
  for (const word of text.split(" ")) {
    const candidate = lines.length ? `${lines.at(-1)} ${word}` : word;
    if (lines.length && setText(face, fontSize, candidate).width <= maxWidth)
      lines[lines.length - 1] = candidate;
    else lines.push(word);
  }
  return lines;
}

const bold = fontFile("D-DIN-PRO-Condensed-700-Bold");
const medium = fontFile("D-DIN-PRO-Condensed-500-Medium");

// The plate: the homepage's title plate (components/sign/), its padding,
// border line and slat joints doubled.
const plate = { x: 80, y: 78, width: 1040, radius: 22 };
const padding = { x: 80, top: 66, bottom: 62 };
const titleSize = 136;
const lineSize = 54;
const lineHeight = 64;
const lines = wrap(medium, lineSize, line, plate.width - 2 * padding.x);
const titleCap = bold.font.capHeight * (titleSize / bold.font.unitsPerEm);
const titleBaseline = plate.y + padding.top + titleCap;
const firstLineBaseline = titleBaseline + 26 + lineHeight;
plate.height =
  firstLineBaseline +
  (lines.length - 1) * lineHeight +
  padding.bottom -
  plate.y;

const text = [
  `<g transform="translate(${plate.x + padding.x} ${titleBaseline})">${setText(bold, titleSize, title).svg}</g>`,
  ...lines.map(
    (text, i) =>
      `<g transform="translate(${plate.x + padding.x} ${firstLineBaseline + i * lineHeight})">${setText(medium, lineSize, text).svg}</g>`,
  ),
].join("");

// one joint every 100 px, the slats between alternately lighter and darker
const joints = [];
for (let y = 100; y < plate.height; y += 100)
  joints.push(
    `<rect x="${plate.x}" y="${plate.y + y - 2}" width="${plate.width}" height="2" fill="#000" fill-opacity="0.2"/>`,
    `<rect x="${plate.x}" y="${plate.y + y}" width="${plate.width}" height="98" fill="${(y / 100) % 2 ? "#000" : "#fff"}" fill-opacity="${(y / 100) % 2 ? 0.035 : 0.025}"/>`,
  );

const posts = [0.21, 0.79].map(
  (at) =>
    `<rect x="${plate.x + plate.width * at - 20}" y="${plate.y + 40}" width="40" height="${height}" fill="url(#post)"/>`,
);

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<defs>
<linearGradient id="post">
<stop offset="0" stop-color="#5d615e"/><stop offset="0.16" stop-color="#8e928e"/><stop offset="0.3" stop-color="#c9ccc7"/><stop offset="0.38" stop-color="#e9ebe6"/><stop offset="0.48" stop-color="#b9bcb7"/><stop offset="0.74" stop-color="#8a8e8a"/><stop offset="1" stop-color="#5a5e5b"/>
</linearGradient>
<clipPath id="plate"><rect x="${plate.x}" y="${plate.y}" width="${plate.width}" height="${plate.height}" rx="${plate.radius}"/></clipPath>
<filter id="shadow" x="-10%" y="-10%" width="120%" height="140%"><feGaussianBlur stdDeviation="14"/></filter>
</defs>
<rect width="${width}" height="${height}" fill="${page}"/>
${posts.join("")}
<rect x="${plate.x + 24}" y="${plate.y + 30}" width="${plate.width - 48}" height="${plate.height - 20}" rx="${plate.radius}" fill="#000" fill-opacity="0.5" filter="url(#shadow)"/>
<rect x="${plate.x}" y="${plate.y}" width="${plate.width}" height="${plate.height}" rx="${plate.radius}" fill="${blue}"/>
<g clip-path="url(#plate)">${joints.join("")}</g>
<rect x="${plate.x + 11}" y="${plate.y + 11}" width="${plate.width - 22}" height="${plate.height - 22}" rx="${plate.radius - 6}" fill="none" stroke="${ink}" stroke-width="6"/>
<g fill="${ink}">${text}</g>
</svg>`;

await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(output);
console.log(`wrote ${path.relative(siteRoot, output)}: ${lines.join(" / ")}`);
