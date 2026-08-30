"""Input normalization and Micron escaping.

Mirrors src/escape.js. See tests/fixtures/README.md for the parser
behavior each rule encodes.
"""

TAB_STOP = 4

# Only dangerous as the first character of a line, where they mean
# heading, section reset, divider and comment. Inline they are ordinary
# text and must not be escaped.
BLOCK_CHARS = ">-<#"

# A line of exactly this toggles literal mode, even from inside a
# literal block.
LITERAL_TOGGLE = "`="


def normalize_text(raw):
    """Normalize line endings and expand tabs.

    Carriage returns are measured as zero columns by the renderer but
    still act on the terminal, so they shear the line and are stripped
    rather than escaped. Tabs have the same problem, so they are
    expanded to spaces.
    """
    text = raw.replace("\r\n", "\n").replace("\r", "\n")
    return expand_tabs(text)


def expand_tabs(text):
    """Expand tabs to spaces, column-aware, at TAB_STOP.

    A tab advances to the next column that is a multiple of TAB_STOP, so
    it contributes between 1 and TAB_STOP spaces depending on where it
    starts. A fixed-width substitution is not equivalent.
    """
    out = []
    column = 0
    for char in text:
        if char == "\t":
            width = TAB_STOP - (column % TAB_STOP)
            out.append(" " * width)
            column += width
        elif char == "\n":
            out.append(char)
            column = 0
        else:
            out.append(char)
            column += 1
    return "".join(out)


def split_lines(text):
    """Split normalized text into lines, dropping one trailing newline."""
    if text == "":
        return []
    lines = text.split("\n")
    if lines and lines[-1] == "":
        lines.pop()
    return lines


def escape_text(text):
    """Escape Micron-significant characters within a line.

    Backslash first, then backtick. A backslash before anything other
    than a backslash or a backtick is silently dropped by the parser, so
    backslashes must always be doubled.
    """
    return text.replace("\\", "\\\\").replace("`", "\\`")


def escape_line(line):
    """Escape a whole line, protecting a line-leading block character.

    The leading backslash is consumed by the parser and occupies zero
    columns, so alignment is preserved. A leading space would shift the
    art by one column and is not used.
    """
    escaped = escape_text(line)
    first = line[:1]
    # The empty string is a substring of BLOCK_CHARS in both Python and
    # JavaScript, so an empty line needs the explicit guard.
    if first != "" and first in BLOCK_CHARS:
        return "\\" + escaped
    return escaped


def literal_line(line):
    """Prepare one line for emission inside a literal block.

    Literal mode escapes nothing except a line that would otherwise
    toggle the block off.
    """
    return "\\" + LITERAL_TOGGLE if line == LITERAL_TOGGLE else line
