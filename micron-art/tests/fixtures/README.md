# Fixtures

These fixtures are the **source of truth** for both implementations.
`src/*.js` and `cli/micronart/*.py` must produce byte-identical output
for every input here. If the two disagree, that is a bug — fix the
implementation, not the fixture.

Never edit an expected file to make a test pass. Change it only when the
Micron behavior it encodes has been re-verified against a real render
(see "How these were verified").

## Layout

    input/<name>.<ext>          the raw ASCII/ANSI art
    expected/<name>.literal.mu  converted, literal mode, monochrome
    expected/<name>.escaped.mu  converted, backtick-escaped, colorizable

Every input gets **two** expected outputs, one per output mode. The modes
are not interchangeable and neither is a fallback for the other.

### `.literal.mu` — literal mode

The art is wrapped in Micron literal mode and emitted verbatim:

    `=
    <art, byte for byte>
    `=

Nothing inside the block is escaped — with exactly one exception.
Micron disables all markup parsing between the two `` `= `` toggles, so
the art is monochrome; colour tags inside a literal block render as text,
they do not apply.

**The one exception:** a line consisting of exactly `` `= `` toggles
literal mode *even from inside a literal block*. Art containing such a
line breaks out of its own block — the line vanishes and everything after
it is parsed as markup. It must be written as `` \`= ``, which is the
only escape literal mode honours. See `literal-toggle`.

This leaves one input that literal mode **cannot represent**: art whose
line is exactly `` \`= ``. Written verbatim it renders as `` `= ``, and
there is no second level of escaping. Use escaped mode for that art. No
fixture covers it because no correct output exists.

### `.escaped.mu` — escaped mode

No literal block. Every Micron-significant character is escaped in place,
so colour and formatting tags can be layered on later. Rules:

| in art | in output | why |
|---|---|---|
| `\`  | `\\`  | `\` is the escape char; a lone `\` is swallowed |
| `` ` `` | ``\` `` | backtick opens a formatting tag |
| line-leading `>` | `\>` | heading |
| line-leading `<` | `\<` | section-depth reset |
| line-leading `-` | `\-` | horizontal divider |
| line-leading `#` | `\#` | comment — **the whole line is deleted** |

Order matters: escape `\` first, then `` ` ``, then prefix the
line-leading block character. The leading `\` is consumed by the parser
and occupies **zero columns**, so alignment is preserved exactly — do not
insert a leading space instead.

`>` `<` `-` `#` are only dangerous as the **first character of a line**.
Inline they are ordinary text and must not be escaped — see
`figlet-banner`, which contains a bare `<` mid-line.

## Normalization

Both modes run the same normalization before anything else. Order matters:

1. **Line endings** — CRLF and lone CR both become LF. A stray `\r` is
   measured as zero columns by urwid but still acts on the terminal, so
   it shears the line. See `crlf`.
2. **Tabs** — expanded to spaces, tab stop 4, column-aware. See below.
3. **Split into lines**, then apply the mode's rules.
4. **Emit with a trailing newline.** Input without one is normalized to
   have one. See `no-trailing-newline`.

Escaping happens *after* normalization, never before.

## Naming

`<name>` describes the hazard being exercised, not the picture. One
hazard per fixture where possible. Input extension is `.txt` for ASCII
and `.ans` for ANSI/SGR art.

## Cases

| fixture | exercises |
|---|---|
| `backticks` | `` ` `` mid-line and as the first character of a line |
| `backslashes` | heavy `\`, including a line that starts with `\` |
| `leading-dash` | line-leading `-`, including a bare `-` line |
| `leading-hash` | line-leading `#` (silently deletes the line) |
| `leading-angle` | line-leading `>` and `<`, single and repeated |
| `tabs-mixed` | mixed tabs and spaces, expanded to **tab stop 4** |
| `trailing-space` | meaningful trailing whitespace |
| `wide-200col` | a single 210-column line |
| `figlet-banner` | realistic block-letter banner; inline `<`, many `\` |
| `empty-lines` | blank lines in the middle of the art |
| `literal-toggle` | a bare `` `= `` line, which breaks out of literal mode |
| `crlf` | CRLF line endings |
| `unicode-box` | box-drawing and shade glyphs, 1 column each |
| `wide-cjk` | double-width glyphs; alignment holds only in columns |
| `empty-file` | zero-byte input |
| `no-trailing-newline` | input with no final newline |
| `ansi-16color` | SGR 30-37 / 90-97, xterm palette |
| `ansi-256color` | SGR 38;5;N — cube, greyscale ramp and base 16 |
| `ansi-truecolor` | SGR 38;2;R;G;B, foreground and background |
| `ansi-attributes` | bold, italic, underline, reverse, dropped blink |
| `ansi-attribute-reset` | 22, 23, 24 and 27 turning attributes back off |
| `ansi-malformed-color` | truncated and invalid 38/48 selectors |
| `ansi-reverse-order` | colour set before, after and across reverse |
| `ansi-out-of-range` | palette indices and components above 255 |
| `chafa-output` | genuine chafa truecolor half-block output |

## Tab expansion

Tabs are expanded to spaces in **both** output modes, before escaping,
at **tab stop 4**.

Expansion is column-aware, not a fixed-width substitution: a tab advances
to the next column that is a multiple of 4, so it contributes between 1
and 4 spaces depending on where it starts. This is Python's
`str.expandtabs(4)`. JavaScript has no equivalent built-in, so `src/`
must implement the column walk explicitly — a naive
`replace(/\t/g, "    ")` produces different output and is a bug.

    "NAME\tVALUE"     ->  "NAME    VALUE"
    "foo\t1"          ->  "foo 1"
    "barbaz\t22"      ->  "barbaz  22"
    "    spaced\tx"   ->  "    spaced  x"
    "\t\tdeep"        ->  "        deep"

The input fixture keeps its raw tabs; only the expected files are
expanded. Tab stop 4 is a project decision, not a Micron requirement —
terminals default to 8, but ASCII art is usually drawn against 4.

## Conventions, not derived facts

Three choices here are project conventions. They are not forced by the
Micron parser, and a reviewer may reasonably want them changed:

- **Tab stop 4** (above). That tabs must be expanded *at all* is forced;
  the stop width is not.
- **Empty input produces empty output** in both modes, rather than an
  empty `` `= `` block. See `empty-file`.
- **Output always ends with a newline**, including when the input did
  not. See `no-trailing-newline`.

Everything under "How these were verified" is the opposite: observed
parser behaviour, not preference.

## Column width

Both implementations must measure display **columns**, not string length.
Python gets this from urwid; JavaScript has no built-in equivalent and
needs an explicit wcwidth-style table. `unicode-box` and `wide-cjk` exist
to catch that divergence.

There is no maximum line width. The 130-column MeshChat limit does not
apply to art hosted on a NomadNet site over Reticulum, so nothing here
guards a width threshold; `wide-200col` exists to prove long lines
survive, not to mark a boundary.

## ANSI colour

`.ans` inputs carry SGR colour. The two modes diverge sharply here:

- **literal** — literal mode disables all markup, so colour is
  impossible. All SGR is stripped and only the glyphs survive. This is
  the monochrome fallback, not a lesser version of escaped mode.
- **escaped** — SGR is translated to Micron colour tags.

### Colour depth

Micron colour is **12-bit: 3 hex nibbles**, e.g. `` `Ff80 `` for
foreground and `` `Bf80 `` for background. This is not a style choice —
the parser reads exactly three characters after `F`/`B` and no more.
`` `Fff0000 `` sets colour `ff0` and then renders the literal text
`000` -- the tag eats five of the eight characters.
`low_color`/`high_color` contain a six-digit branch, but markup
cannot reach it; it serves only the page-level default colours.

Every source colour is therefore quantized to 4 bits per channel.

### Mapping rules

| source | rule |
|---|---|
| 24-bit `38;2;R;G;B` | direct |
| 8-bit `38;5;N` | xterm 256: cube levels `0,95,135,175,215,255`; greys `8+10n` |
| 4-bit `30-37`, `90-97` | xterm default palette, tabulated below |
| quantization | `round(v / 17)` per channel — **round, not truncate** |
| `1` / `3` / `4` | `` `! `` / `` `* `` / `` `_ `` |
| `7` reverse | swap foreground and background |
| `2` faint, `5` blink | no Micron equivalent — dropped, with a warning |
| `39` / `49` | `` `f `` / `` `b `` |

Truncation (`v >> 4`) would bias every image darker by up to 6% for the
same cost, so rounding is used. Greys are emitted as ordinary RGB
nibbles; Micron's `` `gNN `` ramp offers 100 levels instead of 16 but is
a second code path to keep identical across two implementations, so it
is deliberately unused.

The base-16 palette is theme-dependent in real terminals. It is pinned
to xterm's defaults so both implementations agree:

    0-7   000000 cd0000 00cd00 cdcd00 0000ee cd00cd 00cdcd e5e5e5
    8-15  7f7f7f ff0000 00ff00 ffff00 5c5cff ff00ff 00ffff ffffff

### Emission

Tags are emitted **only when the colour changes**, not per cell — a
per-cell encoding costs ten characters of markup per glyph.

**Every line that sets colour closes it with `` `` ``.** Colour state does
carry across lines in Micron — verified: `` `Ff00RED `` followed by a
plain line renders *both* lines red — but that is precisely the problem.
The renderer wraps each line in an attribute taken from the state at the
end of that line and pads the row to the terminal width with it, so a
line ending with a background still set paints it all the way to the
right edge. An underline does the same.

Re-emitting the colour at the start of the next line costs a few
characters and is the price of the art ending where it is drawn.

Art with no colour of its own emits nothing here, so a colour tag applied
by hand ahead of a converted block still carries across its lines —
`examples/gallery.mu` depends on that.

A line-leading colour tag incidentally protects a line-leading block
character, since the line no longer begins with `-` `#` `>` `<`. The
escape is still applied uniformly — verified that `` `Fc00\- `` renders
`-` correctly — so the escaping rule does not need a colour-aware
special case.

### Regenerating `chafa-output`

`chafa-output.ans` is **real chafa output**, not hand-written. The source
image is committed at `src/chafa-source.png` — an 8x8 PNG with a smooth
gradient on the left half and two flat blocks with a hard edge on the
right, so the fixture exercises both per-cell colour changes and runs
that collapse to a single tag.

Generated with chafa 1.14.0:

    chafa --format symbols --size 8x4 --stretch --symbols half \
          --fill none --colors full --dither none --color-space rgb \
          --optimize 5 --polite on src/chafa-source.png \
          > input/chafa-output.ans

Every flag is pinned deliberately. chafa otherwise probes the terminal
and picks symbols, colour depth and optimization to match it, so
unpinned output drifts between environments and the fixture stops being
reproducible. `--optimize 5` is chafa's default and is kept rather than
lowered: at `-O 0` chafa emits a full reset and both colours before
every cell, while at `-O 5` it drops redundant tags and shares one tag
across a run of glyphs. The compact form is what a user actually pastes,
and it exercises colour state carried between cells.

The source image is reproducible too:

    from PIL import Image
    img = Image.new("RGB", (8, 8)); px = img.load()
    for y in range(8):
        for x in range(8):
            if x < 4: px[x, y] = (x*60, 40 + y*28, 200 - y*24)
            else:     px[x, y] = (220, 30, 30) if y < 4 else (20, 60, 220)
    img.save("src/chafa-source.png")

Note that chafa's `half` symbol class includes vertical half blocks
(`▌`) as well as horizontal ones (`▄`), and it uses both here.

### Non-SGR escape sequences

Symbol-format chafa output contains only SGR (`ESC [ ... m`) sequences —
verified across optimization levels. Other escape sequences do not
appear and are not handled. If input is ever accepted from a source that
emits cursor positioning (chafa's `--relative on`, or the sixel and
kitty formats), that assumption breaks and unhandled sequences would
land in the art as literal text.

## How these were verified

Each expected file was rendered through the real NomadNet Micron parser
(`nomadnet/ui/textui/MicronParser.py`) and the resulting terminal rows
compared against the original input art. All expected files round-trip
to the input exactly. Re-run that check when changing an expected file.

For `.ans` fixtures the check is stronger: every rendered character is
compared against its source cell for **both glyph and colour attribute**,
so a wrong quantization or a dropped tag fails rather than passing
silently. All 135 coloured cells match.

Facts established by that check, rather than assumed:

- A leading `\` protects `>` `<` `-` `#` and costs zero columns.
  Literal mode is *not* required for these, and a leading space — which
  would shift the art one column — is not required either.
- `\` before any character other than `\` or `` ` `` is silently dropped,
  so `\` must always be doubled.
- Blank lines are preserved in both modes; they bypass line parsing
  entirely.
- Trailing whitespace is preserved as styled content in both modes, so it
  will carry a background colour. Never `rstrip` a line.
- A line consisting of exactly `` `= `` toggles literal mode, even from
  inside a literal block. Art containing such a line will break out of
  the block. Inside literal mode, `` \`= `` is the escaped form.
- A line of exactly `` `= `` toggles literal mode from *inside* a literal
  block. A naive verbatim wrap silently drops that line and parses the
  remainder as markup — verified: 5 art lines in, 4 rendered out.
- Carriage returns are measured as **zero columns** and passed through,
  same shear class as tabs. They must be stripped, not escaped.
- Width is **columns, not characters**. Box-drawing and shade glyphs are
  1 column; CJK glyphs are 2. In `wide-cjk` the aligned rows have
  character counts of 9 and 12 but both measure 12 columns.
- Tabs are passed through raw and urwid measures them as **zero columns**
  while the terminal expands them to a tab stop, so raw tabs shear the
  line. Tabs are therefore expanded to spaces before output — see
  "Tab expansion" below.
