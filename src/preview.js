// Renders Micron markup back to styled segments, approximating what
// NomadNet will show.
//
// This is deliberately a reader for the markup rather than a view of the
// converter's internal state: previewing the actual output is what
// catches a bad conversion. Behavior follows nomadnet's MicronParser --
// a formatting tag consumes exactly one character (three more for a
// color), a line-leading backslash is consumed as an escape, and a
// comment line disappears entirely.
//
// Returns plain data, no DOM, so it can be tested under node.
//
// See tests/fixtures/README.md.

import { LITERAL_TOGGLE } from "./escape.js";

export const DEFAULT_DIVIDER = "─";

// Indent applied per section depth, matching nomadnet's SECTION_INDENT.
export const SECTION_INDENT = 2;

function newState() {
  return {
    literal: false,
    depth: 0,
    align: "left",
    fg: null,
    bg: null,
    bold: false,
    italic: false,
    underline: false,
  };
}

function currentStyle(state) {
  return {
    fg: state.fg,
    bg: state.bg,
    bold: state.bold,
    italic: state.italic,
    underline: state.underline,
  };
}

// Expand a Micron color to CSS. Three hex nibbles, or gNN for a point on
// the gray ramp. Returns null for anything unparseable, which renders as
// the default color rather than throwing.
export function micronColorToCss(color) {
  if (typeof color !== "string") return null;
  if (color.length !== 3) return null;
  if (color[0] === "g") {
    if (!/^[0-9]{2}$/.test(color.slice(1))) return null;
    const level = Math.round((parseInt(color.slice(1), 10) / 99) * 255);
    const hex = level.toString(16).padStart(2, "0");
    return `#${hex}${hex}${hex}`;
  }
  if (!/^[0-9a-fA-F]{3}$/.test(color)) return null;
  return `#${color[0]}${color[0]}${color[1]}${color[1]}${color[2]}${color[2]}`;
}

// Parse one line's inline content into styled segments.
function renderInline(chars, start, state, preEscape) {
  const segments = [];
  let part = "";
  let mode = "text";
  let escape = preEscape;
  let skip = 0;

  const flush = () => {
    if (part.length > 0) {
      segments.push({ text: part, ...currentStyle(state) });
      part = "";
    }
  };

  for (let i = start; i < chars.length; i += 1) {
    if (skip > 0) {
      skip -= 1;
      continue;
    }
    const c = chars[i];

    if (mode === "formatting") {
      if (c === "_") state.underline = !state.underline;
      else if (c === "!") state.bold = !state.bold;
      else if (c === "*") state.italic = !state.italic;
      else if (c === "F") {
        if (chars.length >= i + 4) {
          state.fg = chars.slice(i + 1, i + 4).join("");
          skip = 3;
        }
      } else if (c === "f") state.fg = null;
      else if (c === "B") {
        if (chars.length >= i + 4) {
          state.bg = chars.slice(i + 1, i + 4).join("");
          skip = 3;
        }
      } else if (c === "b") state.bg = null;
      else if (c === "`") {
        state.bold = false;
        state.underline = false;
        state.italic = false;
        state.fg = null;
        state.bg = null;
        state.align = "left";
      } else if (c === "c") state.align = "center";
      else if (c === "l") state.align = "left";
      else if (c === "r") state.align = "right";
      else if (c === "a") state.align = "left";
      // Anything else is consumed with no effect.
      mode = "text";
      continue;
    }

    if (c === "\\") {
      if (escape) {
        part += c;
        escape = false;
      } else {
        escape = true;
      }
    } else if (c === "`") {
      if (escape) {
        part += c;
        escape = false;
      } else {
        flush();
        mode = "formatting";
      }
    } else {
      part += c;
      escape = false;
    }
  }

  flush();
  return segments;
}

// Render Micron markup into an array of line descriptors.
//
// Each line is one of:
//   { kind: "text",    align, depth, segments }
//   { kind: "heading", align, depth, segments }
//   { kind: "divider", char }
//
// Comment lines produce nothing at all, matching the parser, which drops
// them before any rendering happens.
export function renderPreview(markup) {
  const state = newState();
  const lines = [];

  for (const line of markup.split("\n")) {
    // The literal toggle is checked before the literal guard, so it fires
    // from inside a block as well as outside one.
    if (line === LITERAL_TOGGLE) {
      state.literal = !state.literal;
      continue;
    }

    if (state.literal) {
      const text = line === "\\" + LITERAL_TOGGLE ? LITERAL_TOGGLE : line;
      lines.push({
        kind: "text",
        align: state.align,
        depth: state.depth,
        segments: text === "" ? [] : [{ text, ...currentStyle(state) }],
      });
      continue;
    }

    renderLine(Array.from(line), state, lines);
  }

  return lines;
}

// Dispatch one non-literal line. Recursive, because a section reset
// reparses the remainder of its line from the top.
function renderLine(chars, state, lines) {
  if (chars.length === 0) {
    lines.push({ kind: "text", align: state.align, depth: state.depth, segments: [] });
    return;
  }

  // A line-leading backslash is consumed and escapes the next character,
  // which is how a block character is protected at zero column cost.
  if (chars[0] === "\\") {
    lines.push({
      kind: "text",
      align: state.align,
      depth: state.depth,
      segments: renderInline(chars, 1, state, true),
    });
    return;
  }

  if (chars[0] === "#") return; // comment: the line is dropped entirely

  if (chars[0] === "<") {
    state.depth = 0;
    renderLine(chars.slice(1), state, lines);
    return;
  }

  if (chars[0] === ">") {
    let depth = 0;
    while (depth < chars.length && chars[depth] === ">") depth += 1;
    state.depth = depth;
    if (depth >= chars.length) return; // a bare heading marker renders nothing
    lines.push({
      kind: "heading",
      align: state.align,
      depth,
      segments: renderInline(chars, depth, state, false),
    });
    return;
  }

  if (chars[0] === "-") {
    // "-x" sets the divider glyph; anything longer uses the default.
    lines.push({ kind: "divider", char: chars.length === 2 ? chars[1] : DEFAULT_DIVIDER });
    return;
  }

  lines.push({
    kind: "text",
    align: state.align,
    depth: state.depth,
    segments: renderInline(chars, 0, state, false),
  });
}

// Flatten rendered lines back to plain text, dropping styling.
//
// Round-tripping art through convert() and back through this must return
// the original, which is what the preview tests assert.
export function previewToText(lines) {
  return lines
    .map((line) => {
      // Art never produces a divider -- the converter escapes a leading
      // dash -- so one glyph stands in rather than a guessed width.
      if (line.kind === "divider") return line.char;
      return line.segments.map((segment) => segment.text).join("");
    })
    .join("\n");
}
