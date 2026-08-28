"""SGR parsing.

Reduces ANSI input to a grid of cells, each carrying the graphic state
that applies to one character. Plain text parses cleanly through here
too: every cell simply carries the default state, which lets both input
kinds share one conversion path.

Only SGR (ESC [ ... m) sequences are handled. Symbol-format chafa output
contains nothing else, but cursor positioning from chafa's --relative,
or from the sixel and kitty formats, would land in the art as literal
text.

Mirrors src/ansi.js. See tests/fixtures/README.md.
"""

import re

from .palette import XTERM16, xterm256

SGR_PATTERN = re.compile(r"\x1b\[([0-9;]*)m")


class Style:
    """Graphic state for one cell. None means the document default."""

    __slots__ = ("fg", "bg", "bold", "italic", "underline")

    def __init__(self, fg=None, bg=None, bold=False, italic=False, underline=False):
        self.fg = fg
        self.bg = bg
        self.bold = bold
        self.italic = italic
        self.underline = underline

    def copy(self):
        return Style(self.fg, self.bg, self.bold, self.italic, self.underline)

    def reset(self):
        self.fg = None
        self.bg = None
        self.bold = False
        self.italic = False
        self.underline = False


def apply_sgr(style, params, warnings):
    """Apply one SGR sequence's parameters to `style`, in place."""
    codes = [int(p) if p else 0 for p in params.split(";")] if params else [0]
    i = 0
    while i < len(codes):
        code = codes[i]
        if code == 0:
            style.reset()
        elif code == 1:
            style.bold = True
        elif code == 3:
            style.italic = True
        elif code == 4:
            style.underline = True
        elif code == 7:
            # Micron has no reverse-video attribute, so it is applied by
            # swapping. With a default on either side there is nothing
            # concrete to swap to.
            if style.fg is None or style.bg is None:
                warnings.append("reverse video with a default colour: dropped")
            else:
                style.fg, style.bg = style.bg, style.fg
        elif code == 2:
            warnings.append("faint: no Micron equivalent, dropped")
        elif code in (5, 6):
            warnings.append("blink: no Micron equivalent, dropped")
        elif 30 <= code <= 37:
            style.fg = XTERM16[code - 30]
        elif 90 <= code <= 97:
            style.fg = XTERM16[code - 90 + 8]
        elif 40 <= code <= 47:
            style.bg = XTERM16[code - 40]
        elif 100 <= code <= 107:
            style.bg = XTERM16[code - 100 + 8]
        elif code == 39:
            style.fg = None
        elif code == 49:
            style.bg = None
        elif code in (38, 48):
            is_fg = code == 38
            if i + 1 < len(codes) and codes[i + 1] == 5 and i + 2 < len(codes):
                color = xterm256(codes[i + 2])
                i += 2
            elif i + 1 < len(codes) and codes[i + 1] == 2 and i + 4 < len(codes):
                color = (codes[i + 2], codes[i + 3], codes[i + 4])
                i += 4
            else:
                i += 1
                continue
            if is_fg:
                style.fg = color
            else:
                style.bg = color
        i += 1


def parse_lines(lines):
    """Parse normalized lines into (cells, warnings).

    Each cell is a (Style, character) pair. Graphic state carries across
    line boundaries, matching terminal behaviour.
    """
    style = Style()
    warnings = []
    parsed = []
    for line in lines:
        cells = []
        position = 0
        for match in SGR_PATTERN.finditer(line):
            for char in line[position:match.start()]:
                cells.append((style.copy(), char))
            apply_sgr(style, match.group(1), warnings)
            position = match.end()
        for char in line[position:]:
            cells.append((style.copy(), char))
        parsed.append(cells)
    return parsed, warnings
