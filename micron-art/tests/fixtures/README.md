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
| `wide-200col` | a single 210-char line, over the 130-char warn limit |
| `figlet-banner` | realistic block-letter banner; inline `<`, many `\` |
| `empty-lines` | blank lines in the middle of the art |
| `literal-toggle` | a bare `` `= `` line, which breaks out of literal mode |
| `crlf` | CRLF line endings |
| `unicode-box` | box-drawing and shade glyphs, 1 column each |
| `wide-cjk` | double-width glyphs; alignment holds only in columns |
| `width-boundary` | lines of exactly 129, 130 and 131 columns |
| `empty-file` | zero-byte input |
| `no-trailing-newline` | input with no final newline |
| `chafa-output` | ANSI/SGR colour input (placeholder, not yet written) |

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
to catch that divergence, and the 130-column warn threshold in
`width-boundary` is meaningless if measured in characters.

## How these were verified

Each expected file was rendered through the real NomadNet Micron parser
(`nomadnet/ui/textui/MicronParser.py`) and the resulting terminal rows
compared against the original input art. All expected files round-trip
to the input exactly. Re-run that check when changing an expected file.

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
