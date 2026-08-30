// Color tables and quantization to Micron's 12-bit color space.
//
// Micron color is three hex nibbles. The NomadNet parser reads exactly
// three characters after `F`/`B` and no more, so `Fff0000 sets color ff0
// and then renders the literal text 000 -- the tag eats five of the eight
// characters. Every source color is therefore
// quantized to 4 bits per channel.
//
// Mirrors cli/micronart/palette.py. See tests/fixtures/README.md.

// SGR 30-37 / 90-97 are theme-dependent in real terminals. Pinned to
// xterm's defaults so both implementations agree.
export const XTERM16 = [
  [0x00, 0x00, 0x00], [0xcd, 0x00, 0x00], [0x00, 0xcd, 0x00], [0xcd, 0xcd, 0x00],
  [0x00, 0x00, 0xee], [0xcd, 0x00, 0xcd], [0x00, 0xcd, 0xcd], [0xe5, 0xe5, 0xe5],
  [0x7f, 0x7f, 0x7f], [0xff, 0x00, 0x00], [0x00, 0xff, 0x00], [0xff, 0xff, 0x00],
  [0x5c, 0x5c, 0xff], [0xff, 0x00, 0xff], [0x00, 0xff, 0xff], [0xff, 0xff, 0xff],
];

// Levels of the 6x6x6 color cube occupying indices 16-231.
export const CUBE_LEVELS = [0, 95, 135, 175, 215, 255];

// Resolve an 8-bit SGR color index to an [r, g, b] triple.
export function xterm256(index) {
  if (index < 16) return XTERM16[index];
  if (index < 232) {
    const n = index - 16;
    return [
      CUBE_LEVELS[Math.floor(n / 36)],
      CUBE_LEVELS[Math.floor(n / 6) % 6],
      CUBE_LEVELS[n % 6],
    ];
  }
  const grey = 8 + 10 * (index - 232);
  return [grey, grey, grey];
}

// Quantize one 8-bit channel to a hex nibble.
//
// Rounds rather than truncating: `value >> 4` costs the same and biases
// every image darker by up to 6%.
//
// Python's round() is half-to-even while Math.round is half-up, but
// value/17 never lands exactly on .5 for an integer value in 0-255, so
// the two agree across the whole domain.
export function nibble(value) {
  const quantized = Math.min(15, Math.max(0, Math.round(value / 17)));
  return quantized.toString(16);
}

// Format an [r, g, b] triple as a three-nibble Micron color.
export function micronColor(rgb) {
  return nibble(rgb[0]) + nibble(rgb[1]) + nibble(rgb[2]);
}

// Compare two colors by value, either of which may be null for "the
// document default".
//
// Arrays compare by reference in JavaScript, so `[1,2,3] !== [1,2,3]`.
// The Python side compares tuples by value; without this the emitter
// would treat every cell as a color change and tag all of them.
export function colorsEqual(a, b) {
  if (a === null || b === null) return a === b;
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}
