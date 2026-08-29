# Micron syntax notes

Why the escaping rules are what they are.

Every claim below was read out of the NomadNet source or confirmed by
rendering markup through its parser, and is cited so it can be rechecked.
Nothing here is from memory or from documentation about Micron.

**Source:** NomadNet **0.9.8**, `nomadnet/ui/textui/MicronParser.py`
(906 lines) unless another file is named. Line numbers refer to that
version and will drift; the surrounding code is quoted where it matters.

Confirmations were made by rendering markup through the real parser with
a stub application object and reading the resulting urwid canvas — glyphs
and style attributes both — rather than by eye.

## The shape of the parser

`markup_to_attrmaps` (line 57) splits the document on newlines and hands
each line to `parse_line`. Two consequences fall out immediately.

**Empty lines never reach `parse_line`.** They are turned straight into
an empty `urwid.Text` (line 78 onward), so no line-leading rule can apply
to them and they survive both output modes untouched.

**Each line is wrapped in an `AttrMap` built from the state at the end of
that line** (line 84). urwid then pads the row to the terminal width
using that attribute. This is the single most surprising thing in the
file, and the cause of a real bug: a line ending with a background still
set paints that background across the whole remaining width. An
underline does the same. Bold and italic are carried too but do not show
on blank cells.

That is why escaped output closes every line that sets colour.

## Line-leading characters

`parse_line` tests the first character of the line before anything else,
in this order. The order is what makes escaping possible at all.

| First char | Line | Effect |
|---|---|---|
| `\` | 156 | consumed as an escape; sets `pre_escape` for the rest of the line |
| `#` | 161 | `return None` — **the line is deleted entirely** |
| `` `{ `` | — | partial include |
| `<` | 169 | section depth reset to 0, then the rest of the line is reparsed from the top |
| `>` | 150 | heading; leading `>` are counted for depth |
| `-` | 207 | horizontal divider |

The escape branch comes **first**, and the chain is `elif`. A line
beginning with `\` therefore never reaches the `#`, `<`, `>` or `-`
tests:

```python
if first_char == "\\":
    line = line[1:]
    pre_escape = True
elif first_char == "#":   # unreachable when the line began with a backslash
    return None
```

The backslash is *consumed*, not rendered, so protecting a block
character costs **zero columns** and the art keeps its alignment. A
leading space would also protect the line but shifts it by one column;
that is why it is not used.

Confirmed by render:

| Markup | Renders as |
|---|---|
| `# comment line` | *(line vanishes)* |
| `\# escaped hash` | `# escaped hash` |
| `- divider line` | `────────────────────` |
| `\- escaped dash` | `- escaped dash` |
| `> heading line` | ` heading line` — the `>` is eaten and the line is styled |
| `\> escaped angle` | `> escaped angle` |

### Divider details

A `-` line of **exactly two characters** takes its second character as
the divider glyph (line 208); anything longer uses `─`. Control
characters are rejected because they crash nomadnet — the comment in the
source says so outright.

A divider replaces the line completely. Four dashed rows of art become
four full-width rules, taking their text with them.

### Section reset recurses

`<` sets depth to 0 and then calls `parse_line` again on the remainder
(line 169), so `<#foo` is a comment and `<-` is a divider. Anything
handling that first character has to recurse too, which is why
`preview.js` does.

## Inline syntax

Inside a line, a backtick opens a tag. The parser reads **exactly one
character** after it and then returns to text mode — `mode = "text"` at
line 483 is unconditional.

| Tag | Meaning |
|---|---|
| `` `F `` + 3 | foreground colour |
| `` `B `` + 3 | background colour |
| `` `f `` / `` `b `` | reset foreground / background to default |
| `` `! `` `` `* `` `` `_ `` | bold, italic, underline — **toggles**, not switches |
| `` `` `` | reset everything: colours, attributes and alignment |
| `` `c `` `` `l `` `` `r `` `` `a `` | alignment |
| `` `[label`url] `` | link (line 623) |

An unrecognised character after a backtick is **swallowed silently** and
the parser returns to text mode. So a stray `` `= `` in prose eats itself
*and* the `=`.

### Colour is 12-bit, and that is not negotiable

`` `F `` reads `line[i+1:i+4]` and sets `skip = 3` (line 499). Three
characters, never more. `low_color`/`high_color` contain a six-digit
branch, but markup cannot reach it — it serves only the page-level
default colours passed into `markup_to_attrmaps`.

Confirmed: `` `Fff0000SIX `` sets colour `ff0` and renders the literal
text `000SIX`. The tag ate five of the eight characters.

Colours are three hex nibbles, or `gNN` for a point on a 100-step grey
ramp.

### Escaping inside a line

In text mode (line 688 onward):

- `` ` `` opens a tag unless escaped
- `\` sets the escape flag and emits nothing
- an escaped `` ` `` or `\` is emitted literally
- **a `\` before anything else is silently dropped**

That last point is why backslashes must always be doubled. `\_` renders
as `_`, losing the backslash without warning.

### State persists across lines

Colour and attributes carry from one line to the next: `` `Ff00RED ``
followed by a plain line renders *both* red. Combined with the per-line
`AttrMap` above, this is what makes unterminated colour bleed to the
edge of the terminal.

## Literal mode

`` `= `` on a line by itself toggles literal mode. Two details matter.

**The toggle is checked before the literal guard** (line 143), so it
fires from *inside* a block as well as outside one. Art containing a bare
`` `= `` line breaks out of its own literal block: the line disappears
and everything after it is parsed as markup. Confirmed by render — five
art lines in, four rendered out.

**Literal mode escapes exactly one thing.** The whole body is emitted
verbatim except for a line equal to `` \`= ``, which becomes `` `= ``
(line 478):

```python
if state["literal"]:
    if line == "\\`=":
        line = "`="
```

This leaves one input that literal mode **cannot represent**: art whose
line is exactly `` \`= ``. Written verbatim it renders as `` `= ``, and
there is no second level of escaping. Use escaped mode for that art.

## Width is columns, not characters

The renderer measures display columns through urwid, not string length.
Box-drawing and shade glyphs are one column; CJK glyphs are two.

Two characters are measured as **zero columns** while still affecting a
real terminal, which shears the line:

- **Tab** — `get_width(9)` returns 0, but the terminal advances to a tab
  stop. `calc_width("A\tB\tC")` is 3 for a 5-character string.
- **Carriage return** — same class of problem.

Both are therefore normalised away before conversion rather than passed
through.

## Alignment

`` `c `` centres each line **independently**. Applied to multi-line art
it shears the shape, because every row is centred against its own length
rather than the block's. There is no block-level centring in Micron.

## Serving and linking

From `nomadnet/Node.py` and `nomadnet/NomadNetworkApp.py`:

- Pages are served from `storage/pages` under the config directory
- A request path is `/page` plus the path relative to that directory
- `index.mu` is the browser's default page (`Browser.py:67`)
- A page is executed rather than read **if its executable bit is set**
  (`Node.py:163`) — no separate directory, extension or flag
- A link URL with an empty destination, `:/page/name.mu`, resolves
  against the node currently being browsed

See `hosting.md` for the detail and for what still needs checking on a
running node.

## Rechecking any of this

The claims above were verified by importing the parser directly and
rendering markup through it with a stubbed application object, then
reading the canvas back — both the text and the per-segment style names.
Rendering is what caught the padding bleed and corrected a wrong
description of how dash-leading lines fail; reading the source alone was
not enough in either case.

When a fixture's expected output changes, re-render it rather than
reasoning about it. `tests/fixtures/README.md` records what that check
covers.
