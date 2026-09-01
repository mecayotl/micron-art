// Input normalization and Micron escaping.
//
// Mirrors cli/micronart/escape.py. See tests/fixtures/README.md for the
// parser behavior each rule encodes.

export const TAB_STOP = 4;

// Only dangerous as the first character of a line, where they mean
// heading, section reset, divider and comment. Inline they are ordinary
// text and must not be escaped.
export const BLOCK_CHARS = ">-<#";

// A line of exactly this toggles literal mode, even from inside a
// literal block.
export const LITERAL_TOGGLE = "`=";

// Expand tabs to spaces, column-aware, at TAB_STOP.
//
// A tab advances to the next column that is a multiple of TAB_STOP, so it
// contributes between 1 and TAB_STOP spaces depending on where it starts.
// A fixed-width substitution is not equivalent and would disagree with
// the Python side.
export function expandTabs(text) {
  const out = [];
  let column = 0;
  for (const char of text) {
    if (char === "\t") {
      const width = TAB_STOP - (column % TAB_STOP);
      out.push(" ".repeat(width));
      column += width;
    } else if (char === "\n") {
      out.push(char);
      column = 0;
    } else {
      out.push(char);
      column += 1;
    }
  }
  return out.join("");
}

// Normalize line endings and expand tabs.
//
// Carriage returns are measured as zero columns by the renderer but still
// act on the terminal, so they shear the line and are stripped rather
// than escaped. Tabs have the same problem, so they are expanded.
export function normalizeText(raw) {
  return expandTabs(raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n"));
}

// Split normalized text into lines, dropping one trailing newline.
export function splitLines(text) {
  if (text === "") return [];
  const lines = text.split("\n");
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

// Escape Micron-significant characters within a line.
//
// Backslash first, then backtick. A backslash before anything other than
// a backslash or a backtick is silently dropped by the parser, so
// backslashes must always be doubled.
export function escapeText(text) {
  return text.replace(/\\/g, "\\\\").replace(/`/g, "\\`");
}

// Escape a whole line, protecting a line-leading block character.
//
// The leading backslash is consumed by the parser and occupies zero
// columns, so alignment is preserved. A leading space would shift the art
// by one column and is not used.
export function escapeLine(line) {
  const escaped = escapeText(line);
  const first = line.slice(0, 1);
  // The empty string is a substring of BLOCK_CHARS in both JavaScript and
  // Python, so an empty line needs the explicit guard.
  if (first !== "" && BLOCK_CHARS.includes(first)) return "\\" + escaped;
  return escaped;
}

// Prepare one line for emission inside a literal block.
//
// Literal mode escapes nothing except a line that would otherwise toggle
// the block off.
export function literalLine(line) {
  return line === LITERAL_TOGGLE ? "\\" + LITERAL_TOGGLE : line;
}
