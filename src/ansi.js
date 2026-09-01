// SGR parsing.
//
// Reduces ANSI input to a grid of cells, each carrying the graphic state
// that applies to one character. Plain text parses cleanly through here
// too: every cell simply carries the default state, which lets both input
// kinds share one conversion path.
//
// Only SGR (ESC [ ... m) sequences are handled. Symbol-format chafa output
// contains nothing else, but cursor positioning from chafa's --relative,
// or from the sixel and kitty formats, would land in the art as literal
// text.
//
// Mirrors cli/micronart/ansi.py. See tests/fixtures/README.md.

import { XTERM16, xterm256 } from "./palette.js";

export const SGR_PATTERN = /\x1b\[([0-9;]*)m/g;

// Graphic state for one cell. A null color means the document default.
export function newStyle() {
  // `reverse` is recorded, not applied. The colors keep the slots they
  // were named for and the swap happens at emission, so a color set
  // while reverse is active lands where a terminal would put it. See
  // effectiveColors in converter.js.
  return {
    fg: null,
    bg: null,
    bold: false,
    italic: false,
    underline: false,
    reverse: false,
  };
}

export function copyStyle(style) {
  return {
    fg: style.fg,
    bg: style.bg,
    bold: style.bold,
    italic: style.italic,
    underline: style.underline,
    reverse: style.reverse,
  };
}

export function resetStyle(style) {
  style.fg = null;
  style.bg = null;
  style.bold = false;
  style.italic = false;
  style.underline = false;
  style.reverse = false;
}

// Apply one SGR sequence's parameters to `style`, in place.
export function applySgr(style, params, warnings) {
  // An empty parameter list means 0, and so does an empty field within
  // one: "[m" and "[1;;2m" both contain implicit zeroes. parseInt("")
  // is NaN, so the empty case is handled before parsing.
  const codes =
    params === ""
      ? [0]
      : params.split(";").map((part) => (part === "" ? 0 : parseInt(part, 10)));

  let i = 0;
  while (i < codes.length) {
    const code = codes[i];
    if (code === 0) {
      resetStyle(style);
    } else if (code === 1) {
      style.bold = true;
    } else if (code === 3) {
      style.italic = true;
    } else if (code === 4) {
      style.underline = true;
    } else if (code === 7) {
      style.reverse = true;
    } else if (code === 22) {
      // Normal intensity. Also clears faint, which is not tracked.
      style.bold = false;
    } else if (code === 23) {
      style.italic = false;
    } else if (code === 24) {
      style.underline = false;
    } else if (code === 27) {
      style.reverse = false;
    } else if (code === 2) {
      warnings.push("faint: no Micron equivalent, dropped");
    } else if (code === 5 || code === 6) {
      warnings.push("blink: no Micron equivalent, dropped");
    } else if (code >= 30 && code <= 37) {
      style.fg = XTERM16[code - 30];
    } else if (code >= 90 && code <= 97) {
      style.fg = XTERM16[code - 90 + 8];
    } else if (code >= 40 && code <= 47) {
      style.bg = XTERM16[code - 40];
    } else if (code >= 100 && code <= 107) {
      style.bg = XTERM16[code - 100 + 8];
    } else if (code === 39) {
      style.fg = null;
    } else if (code === 49) {
      style.bg = null;
    } else if (code === 38 || code === 48) {
      const isForeground = code === 38;
      let color;
      if (i + 1 < codes.length && codes[i + 1] === 5 && i + 2 < codes.length) {
        const index = codes[i + 2];
        if (!(index >= 0 && index <= 255)) {
          warnings.push(`color index ${index} out of range: remainder ignored`);
          break;
        }
        color = xterm256(index);
        i += 2;
      } else if (i + 1 < codes.length && codes[i + 1] === 2 && i + 4 < codes.length) {
        const rgb = [codes[i + 2], codes[i + 3], codes[i + 4]];
        if (!rgb.every((value) => value >= 0 && value <= 255)) {
          warnings.push("color component out of range: remainder ignored");
          break;
        }
        color = rgb;
        i += 4;
      } else {
        // The selector is missing or unparseable. Abandon the rest of the
        // sequence rather than reading its leftovers as further SGR
        // codes, which would apply attributes nobody asked for.
        warnings.push("malformed extended color sequence: remainder ignored");
        break;
      }
      if (isForeground) style.fg = color;
      else style.bg = color;
    }
    i += 1;
  }
}

// Parse normalized lines into { parsed, warnings }.
//
// Each cell is a { style, char } pair. Graphic state carries across line
// boundaries, matching terminal behavior.
export function parseLines(lines) {
  const style = newStyle();
  const warnings = [];
  const parsed = [];

  for (const line of lines) {
    const cells = [];
    let position = 0;
    // The pattern is global, so lastIndex is reset for each line.
    SGR_PATTERN.lastIndex = 0;
    let match = SGR_PATTERN.exec(line);
    while (match !== null) {
      for (const char of line.slice(position, match.index)) {
        cells.push({ style: copyStyle(style), char });
      }
      applySgr(style, match[1], warnings);
      position = match.index + match[0].length;
      match = SGR_PATTERN.exec(line);
    }
    for (const char of line.slice(position)) {
      cells.push({ style: copyStyle(style), char });
    }
    parsed.push(cells);
  }

  return { parsed, warnings };
}
