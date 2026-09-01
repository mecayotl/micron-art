// Tests for the Micron preview renderer.
//
// The strong assertion here is a round trip: art converted to Micron and
// read back through the preview must reproduce the original art exactly,
// in both modes. That is the same property the fixtures were verified
// against a real nomadnet render for, so a preview that disagrees is
// showing the user something NomadNet would not.

import { strict as assert } from "node:assert";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { parseLines } from "../src/ansi.js";
import { MODES, convert } from "../src/converter.js";
import { normalizeText, splitLines } from "../src/escape.js";
import { micronColorToCss, previewToText, renderPreview } from "../src/preview.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, "fixtures");

function fixtureNames() {
  return readdirSync(join(FIXTURES, "input"))
    .filter((name) => name.endsWith(".txt") || name.endsWith(".ans"))
    .sort();
}

function read(path) {
  return readFileSync(path, "utf8");
}

for (const name of fixtureNames()) {
  const stem = name.slice(0, name.lastIndexOf("."));
  for (const mode of MODES) {
    test(`round trip: ${stem}.${mode}`, () => {
      const raw = read(join(FIXTURES, "input", name));
      // The baseline is the glyphs, not the raw line: for .ans input the
      // SGR sequences become Micron tags and must not appear as text.
      const { parsed } = parseLines(splitLines(normalizeText(raw)));
      const art = parsed
        .map((cells) => cells.map((cell) => cell.char).join(""))
        .join("\n");
      const { markup } = convert(raw, mode);
      // convert() ends with a newline, which would read back as a
      // trailing blank line the art does not have.
      const rendered = previewToText(renderPreview(markup.replace(/\n$/, "")));
      assert.equal(rendered, art);
    });
  }
}

test("color tags survive the round trip", () => {
  const { markup } = convert("\x1b[38;2;255;128;0mX\x1b[0m", "escaped");
  const lines = renderPreview(markup.replace(/\n$/, ""));
  assert.equal(lines.length, 1);
  assert.equal(lines[0].segments.length, 1);
  assert.equal(lines[0].segments[0].text, "X");
  assert.equal(lines[0].segments[0].fg, "f80");
});

test("literal mode carries no color", () => {
  const { markup } = convert("\x1b[31mRED\x1b[0m", "literal");
  const lines = renderPreview(markup.replace(/\n$/, ""));
  assert.equal(lines[0].segments[0].text, "RED");
  assert.equal(lines[0].segments[0].fg, null);
});

test("a bare literal toggle inside a block breaks out", () => {
  // The hazard literal-toggle exists for: unescaped, the line vanishes
  // and the remainder is parsed as markup.
  const naive = "`=\nA\n`=\nB\n`=";
  assert.equal(previewToText(renderPreview(naive)), "A\nB");
  // Escaped, all three lines survive.
  const correct = "`=\nA\n\\`=\nB\n`=";
  assert.equal(previewToText(renderPreview(correct)), "A\n`=\nB");
});

test("unescaped block characters are mangled, escaped ones are not", () => {
  assert.equal(previewToText(renderPreview("# gone")), "");
  assert.equal(previewToText(renderPreview("\\# kept")), "# kept");
  assert.equal(renderPreview("- x").length, 1);
  assert.equal(renderPreview("- x")[0].kind, "divider");
  assert.equal(previewToText(renderPreview("\\- kept")), "- kept");
  assert.equal(renderPreview(">> head")[0].kind, "heading");
  assert.equal(renderPreview(">> head")[0].depth, 2);
});

test("a color tag consumes exactly three characters", () => {
  // The tag eats five of the eight characters: `Fff0000 sets ff0 and
  // renders the literal text 000.
  const lines = renderPreview("`Fff0000SIX");
  assert.equal(lines[0].segments[0].fg, "ff0");
  assert.equal(lines[0].segments[0].text, "000SIX");
});

test("color state persists across lines", () => {
  const lines = renderPreview("`Ff00RED\nSECOND");
  assert.equal(lines[0].segments[0].fg, "f00");
  assert.equal(lines[1].segments[0].fg, "f00");
});

test("micron colors expand to CSS", () => {
  assert.equal(micronColorToCss("f80"), "#ff8800");
  assert.equal(micronColorToCss("000"), "#000000");
  assert.equal(micronColorToCss("g99"), "#ffffff");
  assert.equal(micronColorToCss("g00"), "#000000");
  assert.equal(micronColorToCss("zz"), null);
  assert.equal(micronColorToCss(null), null);
});
