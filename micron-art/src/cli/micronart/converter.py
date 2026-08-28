"""Conversion of ASCII/ANSI art into Micron markup.

Two output modes, which are not interchangeable:

  literal   wrapped in `=, emitted verbatim, monochrome
  escaped   characters escaped in place, colour tags applied

Mirrors src/converter.js. See tests/fixtures/README.md.
"""

from .ansi import Style, parse_lines
from .escape import (
    LITERAL_TOGGLE,
    BLOCK_CHARS,
    escape_text,
    literal_line,
    normalize_text,
    split_lines,
)
from .palette import micron_color

LITERAL = "literal"
ESCAPED = "escaped"
MODES = (LITERAL, ESCAPED)

# Emitted once at the end of a coloured document. Without it, colour
# leaks into whatever follows the art on the page.
RESET = "``"

_ATTRIBUTE_TAGS = (("bold", "`!"), ("italic", "`*"), ("underline", "`_"))


def to_literal(parsed):
    """Render parsed cells as a literal block, dropping all colour."""
    if not parsed:
        return ""
    body = [literal_line("".join(char for _, char in cells)) for cells in parsed]
    return LITERAL_TOGGLE + "\n" + "\n".join(body) + "\n" + LITERAL_TOGGLE + "\n"


def to_escaped(parsed):
    """Render parsed cells with escaping and Micron colour tags.

    Tags are emitted only when the state changes, not per cell: a
    per-cell encoding costs ten characters of markup per glyph. State is
    carried across lines because the parser carries it too, so a
    per-line reset would be larger, not smaller.
    """
    if not parsed:
        return ""

    current = Style()
    emitted_any = False
    out = []

    for cells in parsed:
        buf = []
        for index, (style, char) in enumerate(cells):
            if style.fg != current.fg:
                buf.append("`f" if style.fg is None else "`F" + micron_color(style.fg))
                current.fg = style.fg
                emitted_any = True
            if style.bg != current.bg:
                buf.append("`b" if style.bg is None else "`B" + micron_color(style.bg))
                current.bg = style.bg
                emitted_any = True
            for name, tag in _ATTRIBUTE_TAGS:
                if getattr(style, name) != getattr(current, name):
                    buf.append(tag)
                    setattr(current, name, getattr(style, name))
                    emitted_any = True
            # Escaping is applied per character rather than per line
            # because tags are interleaved with the text. A leading
            # colour tag would already protect a block character, but
            # the escape is applied uniformly and renders correctly on
            # top of one.
            text = escape_text(char)
            if index == 0 and char in BLOCK_CHARS:
                text = "\\" + text
            buf.append(text)
        out.append("".join(buf))

    document = "\n".join(out)
    if emitted_any:
        document += RESET
    return document + "\n"


def convert(raw, mode):
    """Convert art to Micron markup.

    Returns (markup, warnings). `raw` may be plain text or contain SGR
    colour; both take the same path.
    """
    if mode not in MODES:
        raise ValueError("mode must be one of %s" % (", ".join(MODES),))
    parsed, warnings = parse_lines(split_lines(normalize_text(raw)))
    markup = to_literal(parsed) if mode == LITERAL else to_escaped(parsed)
    return markup, warnings
