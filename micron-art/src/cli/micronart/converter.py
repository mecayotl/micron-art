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

REVERSE_UNREPRESENTABLE = "reverse video with a default colour: dropped"


def effective_colors(style, warnings, state):
    """Resolve a cell's colours, applying reverse video at emission.

    Reverse is a rendering attribute in a terminal: the colours keep the
    slots they were named for and are swapped when drawn. Resolving it
    here rather than when the code is read means a colour set while
    reverse is active lands where a terminal would put it.

    Micron has no reverse attribute, so the swap has to be written out as
    concrete colours. That is only possible when both sides are set --
    swapping against a default would need the document's default colour
    as an explicit value, which is theme-dependent and not knowable here.
    """
    if not style.reverse:
        return style.fg, style.bg
    if style.fg is None or style.bg is None:
        if warnings is not None and not state["warned_reverse"]:
            warnings.append(REVERSE_UNREPRESENTABLE)
            state["warned_reverse"] = True
        return style.fg, style.bg
    return style.bg, style.fg


def to_literal(parsed):
    """Render parsed cells as a literal block, dropping all colour."""
    if not parsed:
        return ""
    body = [literal_line("".join(char for _, char in cells)) for cells in parsed]
    return LITERAL_TOGGLE + "\n" + "\n".join(body) + "\n" + LITERAL_TOGGLE + "\n"


def to_escaped(parsed, warnings=None):
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
    state = {"warned_reverse": False}

    for cells in parsed:
        buf = []
        for index, (style, char) in enumerate(cells):
            fg, bg = effective_colors(style, warnings, state)
            if fg != current.fg:
                buf.append("`f" if fg is None else "`F" + micron_color(fg))
                current.fg = fg
                emitted_any = True
            if bg != current.bg:
                buf.append("`b" if bg is None else "`B" + micron_color(bg))
                current.bg = bg
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
    if mode == LITERAL:
        # Literal mode drops all colour, so reverse cannot fail to be
        # representable and raises nothing.
        markup = to_literal(parsed)
    else:
        markup = to_escaped(parsed, warnings)
    return markup, warnings
