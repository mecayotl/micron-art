// Conversion of ASCII/ANSI art into Micron markup.
//
// Two output modes, which are not interchangeable:
//
//   literal   wrapped in `=, emitted verbatim, monochrome
//   escaped   characters escaped in place, colour tags applied
//
// Mirrors cli/micronart/converter.py. See tests/fixtures/README.md.

import { newStyle, parseLines } from "./ansi.js";
import {
  BLOCK_CHARS,
  LITERAL_TOGGLE,
  escapeText,
  literalLine,
  normalizeText,
  splitLines,
} from "./escape.js";
import { colorsEqual, micronColor } from "./palette.js";

export const LITERAL = "literal";
export const ESCAPED = "escaped";
export const MODES = [LITERAL, ESCAPED];

// Emitted once at the end of a coloured document. Without it, colour
// leaks into whatever follows the art on the page.
export const RESET = "``";

const ATTRIBUTE_TAGS = [
  ["bold", "`!"],
  ["italic", "`*"],
  ["underline", "`_"],
];

// Render parsed cells as a literal block, dropping all colour.
export function toLiteral(parsed) {
  if (parsed.length === 0) return "";
  const body = parsed.map((cells) =>
    literalLine(cells.map((cell) => cell.char).join("")),
  );
  return LITERAL_TOGGLE + "\n" + body.join("\n") + "\n" + LITERAL_TOGGLE + "\n";
}

// Render parsed cells with escaping and Micron colour tags.
//
// Tags are emitted only when the state changes, not per cell: a per-cell
// encoding costs ten characters of markup per glyph. State is carried
// across lines because the parser carries it too, so a per-line reset
// would be larger, not smaller.
export function toEscaped(parsed) {
  if (parsed.length === 0) return "";

  const current = newStyle();
  let emittedAny = false;
  const out = [];

  for (const cells of parsed) {
    const buf = [];
    for (let index = 0; index < cells.length; index += 1) {
      const { style, char } = cells[index];

      if (!colorsEqual(style.fg, current.fg)) {
        buf.push(style.fg === null ? "`f" : "`F" + micronColor(style.fg));
        current.fg = style.fg;
        emittedAny = true;
      }
      if (!colorsEqual(style.bg, current.bg)) {
        buf.push(style.bg === null ? "`b" : "`B" + micronColor(style.bg));
        current.bg = style.bg;
        emittedAny = true;
      }
      for (const [name, tag] of ATTRIBUTE_TAGS) {
        if (style[name] !== current[name]) {
          buf.push(tag);
          current[name] = style[name];
          emittedAny = true;
        }
      }

      // Escaping is applied per character rather than per line because
      // tags are interleaved with the text. A leading colour tag would
      // already protect a block character, but the escape is applied
      // uniformly and renders correctly on top of one.
      let text = escapeText(char);
      if (index === 0 && BLOCK_CHARS.includes(char)) text = "\\" + text;
      buf.push(text);
    }
    out.push(buf.join(""));
  }

  let document = out.join("\n");
  if (emittedAny) document += RESET;
  return document + "\n";
}

// Convert art to Micron markup.
//
// Returns { markup, warnings }. `raw` may be plain text or contain SGR
// colour; both take the same path.
export function convert(raw, mode) {
  if (!MODES.includes(mode)) {
    throw new Error("mode must be one of " + MODES.join(", "));
  }
  const { parsed, warnings } = parseLines(splitLines(normalizeText(raw)));
  const markup = mode === LITERAL ? toLiteral(parsed) : toEscaped(parsed);
  return { markup, warnings };
}
