// Fixture-driven tests for the browser converter.
//
// The fixtures are the source of truth. Never edit an expected file to
// make a test pass; see tests/fixtures/README.md.
//
// Run with `node --test tests/` from .

import { strict as assert } from "node:assert";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { MODES, convert } from "../src/converter.js";
import { expandTabs } from "../src/escape.js";
import { colorsEqual, micronColor, nibble, xterm256 } from "../src/palette.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, "fixtures");

function fixtureNames() {
  return readdirSync(join(FIXTURES, "input"))
    .filter((name) => name.endsWith(".txt") || name.endsWith(".ans"))
    .sort();
}

// utf8 keeps bytes as they are, so the CRLF fixture stays intact.
function read(path) {
  return readFileSync(path, "utf8");
}

function stemOf(name) {
  return name.slice(0, name.lastIndexOf("."));
}

test("every fixture has both expected outputs", () => {
  for (const name of fixtureNames()) {
    for (const mode of MODES) {
      const path = join(FIXTURES, "expected", `${stemOf(name)}.${mode}.mu`);
      assert.doesNotThrow(() => read(path), `missing expected output: ${path}`);
    }
  }
});

for (const name of fixtureNames()) {
  const stem = stemOf(name);
  for (const mode of MODES) {
    test(`${stem}.${mode}`, () => {
      const raw = read(join(FIXTURES, "input", name));
      const expected = read(join(FIXTURES, "expected", `${stem}.${mode}.mu`));
      const { markup } = convert(raw, mode);
      assert.equal(markup, expected);
    });
  }
}

test("tabs expand column-aware", () => {
  // A fixed-width substitution would give the same answer for the first
  // case and the wrong one for the rest.
  assert.equal(expandTabs("NAME\tVALUE"), "NAME    VALUE");
  assert.equal(expandTabs("foo\t1"), "foo 1");
  assert.equal(expandTabs("barbaz\t22"), "barbaz  22");
  assert.equal(expandTabs("\t\tdeep"), "        deep");
  assert.equal(expandTabs("a\tb\nc\td"), "a   b\nc   d");
});

test("quantization rounds rather than truncating", () => {
  assert.equal(nibble(255), "f");
  assert.equal(nibble(0), "0");
  assert.equal(nibble(128), "8");
  assert.equal(nibble(127), "7");
  assert.equal(micronColor([255, 128, 0]), "f80");
});

test("xterm256 resolves cube and greys", () => {
  assert.deepEqual(xterm256(196), [255, 0, 0]);
  assert.deepEqual(xterm256(46), [0, 255, 0]);
  assert.deepEqual(xterm256(21), [0, 0, 255]);
  assert.deepEqual(xterm256(244), [128, 128, 128]);
  assert.deepEqual(xterm256(1), [0xcd, 0x00, 0x00]);
});

test("colours compare by value, not reference", () => {
  // Arrays compare by reference in JavaScript. Without colorsEqual the
  // emitter would treat every cell as a colour change.
  assert.ok(colorsEqual([1, 2, 3], [1, 2, 3]));
  assert.ok(!colorsEqual([1, 2, 3], [1, 2, 4]));
  assert.ok(colorsEqual(null, null));
  assert.ok(!colorsEqual(null, [0, 0, 0]));
});

test("unknown mode is rejected", () => {
  assert.throws(() => convert("x", "colour"), /mode must be one of/);
});

// Deliberately an independent reader, not the converter's own state
// machine: a test that shared that machinery would pass vacuously.
//
// The renderer wraps each line in an attribute taken from the state at the
// end of that line and pads the row with it, so a line that ends with a
// background still set paints it to the terminal edge.
function stateAtEndOfEachLine(markup) {
  const states = [];
  let fg = null;
  let bg = null;
  let bold = false;
  let italic = false;
  let underline = false;
  for (const line of markup.split("\n")) {
    const chars = [...line];
    let escape = false;
    let i = 0;
    if (chars[0] === "\\") {
      escape = true;
      i = 1;
    }
    for (; i < chars.length; i += 1) {
      const c = chars[i];
      if (escape) {
        escape = false;
        continue;
      }
      if (c === "\\") {
        escape = true;
      } else if (c === "`") {
        const tag = chars[i + 1];
        i += 1;
        if (tag === "F") {
          fg = chars.slice(i + 1, i + 4).join("");
          i += 3;
        } else if (tag === "B") {
          bg = chars.slice(i + 1, i + 4).join("");
          i += 3;
        } else if (tag === "f") fg = null;
        else if (tag === "b") bg = null;
        else if (tag === "!") bold = !bold;
        else if (tag === "*") italic = !italic;
        else if (tag === "_") underline = !underline;
        else if (tag === "`") {
          fg = null;
          bg = null;
          bold = false;
          italic = false;
          underline = false;
        }
      }
    }
    states.push({ fg, bg, bold, italic, underline });
  }
  return states;
}

test("no line of escaped output leaves colour or attributes open", () => {
  for (const name of fixtureNames()) {
    const stem = stemOf(name);
    const { markup } = convert(read(join(FIXTURES, "input", name)), "escaped");
    if (markup === "") continue;
    const states = stateAtEndOfEachLine(markup.replace(/\n$/, ""));
    states.forEach((s, index) => {
      assert.deepEqual(
        s,
        { fg: null, bg: null, bold: false, italic: false, underline: false },
        `${stem} line ${index} would paint its background to the terminal edge`,
      );
    });
  }
});
