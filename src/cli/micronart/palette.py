"""Color tables and quantization to Micron's 12-bit color space.

Micron color is three hex nibbles. The NomadNet parser reads exactly
three characters after `F`/`B` and no more, so `Fff0000 sets color ff0
and then renders the literal text 000 -- the tag eats five of the eight
characters. Every source color is therefore
quantized to 4 bits per channel.

Mirrors src/palette.js. See tests/fixtures/README.md.
"""

# SGR 30-37 / 90-97 are theme-dependent in real terminals. Pinned to
# xterm's defaults so both implementations agree.
XTERM16 = [
    (0x00, 0x00, 0x00), (0xCD, 0x00, 0x00), (0x00, 0xCD, 0x00), (0xCD, 0xCD, 0x00),
    (0x00, 0x00, 0xEE), (0xCD, 0x00, 0xCD), (0x00, 0xCD, 0xCD), (0xE5, 0xE5, 0xE5),
    (0x7F, 0x7F, 0x7F), (0xFF, 0x00, 0x00), (0x00, 0xFF, 0x00), (0xFF, 0xFF, 0x00),
    (0x5C, 0x5C, 0xFF), (0xFF, 0x00, 0xFF), (0x00, 0xFF, 0xFF), (0xFF, 0xFF, 0xFF),
]

# Levels of the 6x6x6 color cube occupying indices 16-231.
CUBE_LEVELS = [0, 95, 135, 175, 215, 255]


def xterm256(index):
    """Resolve an 8-bit SGR color index to an (r, g, b) triple."""
    if index < 16:
        return XTERM16[index]
    if index < 232:
        n = index - 16
        return (CUBE_LEVELS[n // 36], CUBE_LEVELS[(n // 6) % 6], CUBE_LEVELS[n % 6])
    gray = 8 + 10 * (index - 232)
    return (gray, gray, gray)


def nibble(value):
    """Quantize one 8-bit channel to a hex nibble.

    Rounds rather than truncating. `value >> 4` costs the same and biases
    every image darker by up to 6%.
    """
    return format(min(15, max(0, round(value / 17))), "x")


def micron_color(rgb):
    """Format an (r, g, b) triple as a three-nibble Micron color."""
    r, g, b = rgb
    return nibble(r) + nibble(g) + nibble(b)
