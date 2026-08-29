# ANSI to Micron mapping

What `src/ansi.js` and `cli/micronart/ansi.py` actually do with SGR
escape sequences. This documents the code as written, not an intended
design — where the behaviour is surprising, it is described as it is and
marked, not tidied up.

The two implementations were compared across 669 SGR cases, including
every one of the 256 palette indices in both foreground and background,
malformed sequences, and multi-line colour carry-over. They agree on all
of them, in both markup and warnings.

Colour only survives in **escaped** mode. Literal mode disables Micron
markup entirely, so every SGR sequence is stripped and only the glyphs
remain. That is not a degraded colour path; it is a different output.

## What is recognized

| SGR | Meaning | Result |
|---|---|---|
| `0` | reset | clears colours and all attributes |
| `1` | bold | `` `! `` |
| `2` | faint | dropped, **with a warning** |
| `3` | italic | `` `* `` |
| `4` | underline | `` `_ `` |
| `5`, `6` | blink | dropped, **with a warning** |
| `7` | reverse video | swaps foreground and background |
| `30`–`37` | foreground, base 8 | `` `F `` + table below |
| `38;5;N` | foreground, 256-colour | `` `F `` + cube/grey rules |
| `38;2;R;G;B` | foreground, 24-bit | `` `F `` + quantization |
| `39` | default foreground | `` `f `` |
| `40`–`47` | background, base 8 | `` `B `` + table below |
| `48;5;N`, `48;2;R;G;B` | background | as `38`, but `` `B `` |
| `49` | default background | `` `b `` |
| `90`–`97` | foreground, bright 8 | `` `F `` + table below |
| `100`–`107` | background, bright 8 | `` `B `` + table below |

**Everything else is dropped silently** — no warning, no trace in the
output. That includes `8` (conceal), `9` (strikethrough), `21`, `53`
(overline), and any code with no meaning at all. Only `2`, `5`, `6` and
one case of `7` warn; the rest vanish.

Tags are emitted only when the state changes, not per cell, and colour
state carries across lines. A document that emitted any tag ends with a
single `` `` `` reset.

## Two behaviours that will surprise you

### Attribute off-codes are not implemented

`22` (bold off), `23` (italic off), `24` (underline off) and `27`
(reverse off) fall into the silently-dropped bucket. The attribute
**stays on**:

    ESC[1;3;4m X ESC[22m Y   ->   `!`*`_XY``

Both `X` and `Y` are bold, italic and underlined. The only ways to turn
an attribute off are `0`, or the end-of-document reset.

This rarely bites with generated art — chafa never emits `22` — but
hand-written ANSI or terminal captures may, and the result is formatting
that bleeds to the end of the document.

### A malformed 38/48 sequence has its remainder reinterpreted

When `38` or `48` is not followed by a well-formed selector, the parser
does not abort the sequence. It advances one parameter and carries on,
so **the leftover parameters are read as ordinary SGR codes**:

| Input | Codes seen | Result |
|---|---|---|
| `ESC[38;5m` | `38`, then `5` | blink warning, no colour |
| `ESC[38;2;1;2m` | `38`, then `2`, `1`, `2` | faint warning, **and bold applied** |
| `ESC[38;9;1m` | `38`, then `9`, `1` | bold applied |
| `ESC[1;;2m` | `1`, `0`, `2` | empty field reads as `0`, resetting the bold |

So a truncated 256-colour sequence produces a *blink* warning, and a
truncated truecolour sequence can turn text bold. The warnings are real
warnings about codes that really were parsed; they just came from the
wreckage of a colour sequence rather than from the author's intent.

Empty parameter lists and empty fields both read as `0`: `ESC[m` is a
full reset.

## The 16 standard colours

The base 16 are theme-dependent in real terminals — there is no correct
answer, only a documented one. These are pinned to **xterm's defaults**
so both implementations agree, and quantized with the same rule as
everything else.

| SGR fg | SGR bg | Name | xterm RGB | Micron |
|---|---|---|---|---|
| 30 | 40 | black | `#000000` | `000` |
| 31 | 41 | red | `#cd0000` | `c00` |
| 32 | 42 | green | `#00cd00` | `0c0` |
| 33 | 43 | yellow | `#cdcd00` | `cc0` |
| 34 | 44 | blue | `#0000ee` | `00e` |
| 35 | 45 | magenta | `#cd00cd` | `c0c` |
| 36 | 46 | cyan | `#00cdcd` | `0cc` |
| 37 | 47 | white | `#e5e5e5` | `ddd` |
| 90 | 100 | bright black | `#7f7f7f` | `777` |
| 91 | 101 | bright red | `#ff0000` | `f00` |
| 92 | 102 | bright green | `#00ff00` | `0f0` |
| 93 | 103 | bright yellow | `#ffff00` | `ff0` |
| 94 | 104 | bright blue | `#5c5cff` | `55f` |
| 95 | 105 | bright magenta | `#ff00ff` | `f0f` |
| 96 | 106 | bright cyan | `#00ffff` | `0ff` |
| 97 | 107 | bright white | `#ffffff` | `fff` |

If your terminal uses a different palette — VGA, Solarized, anything
themed — colours converted from `30`–`37` will not match what you saw on
screen. Convert from truecolour if that matters.

## Bold is intensity, never a colour shift

`1` sets the bold attribute and emits `` `! ``. It **does not** brighten
the foreground.

    ESC[1;31m  ->  `Fc00`!     bold, standard red
    ESC[91m    ->  `Ff00       bright red, not bold

Many terminals render `ESC[1;31m` as bright red, so a capture that relied
on that will come out darker than it looked, and bold instead. Whether
NomadNet renders bold as a weight change or as brightness is up to the
client. Art that needs bright colours should use `90`–`97` or truecolour.

## 256-colour palette

Indices resolve before quantization:

- **0–15** — the table above.
- **16–231** — the 6×6×6 cube. Index `n - 16` decomposes as
  `36r + 6g + b`, and each component maps through the level table
  `[0, 95, 135, 175, 215, 255]`.
- **232–255** — the grey ramp, `8 + 10 × (n - 232)`, giving 8 to 238.

## 24-bit truecolour

`38;2;R;G;B` is taken directly, then quantized like everything else.

## Quantization: round, not truncate

Micron colour is three hex nibbles — 4 bits per channel — because the
NomadNet parser reads exactly three characters after `F`/`B`. Every
source colour lands in that space:

    nibble = round(value / 17)

Rounding rather than truncating (`value >> 4`) is deliberate. Truncation
costs the same and biases every image darker:

| value | `round(v/17)` | `v >> 4` |
|---|---|---|
| 8 | `0` | `0` |
| 9 | `1` | `0` |
| 26 | `2` | `1` |
| 128 | `8` | `8` |
| 255 | `f` | `f` |

Worst-case per-channel error is **8 of 255, about 3.1%**.

## What you give up

Converting a 24-bit chafa render is lossy, in ways worth knowing before
you spend effort on the source image.

**16.7 million colours become 4096.** Each channel keeps 4 bits of the
original 8. Smooth gradients band: adjacent cells that differed by a few
units collapse onto the same nibble and the transition becomes a step.
Small images and flat-colour art survive this well; photographic
gradients do not.

**The 256-colour palette is not injective under conversion.** It
collapses to 233 distinct Micron colours — 17 colours absorb 40 indices.
The grey ramp suffers most, since its 10-unit steps are finer than the
17-unit quantum:

| Micron | absorbs |
|---|---|
| `000` | 0 (base), 16 (cube), 232 (grey) |
| `222` | 234, 235 (grey) |
| `333` | 236, 237 (grey) |
| `555` | 239, 240 (grey) |
| `666` | 59 (cube), 241, 242 (grey) |
| `777` | 8 (base), 243 (grey) |
| `888` | 102 (cube), 244, 245 (grey) |
| `999` | 246, 247 (grey) |
| `aaa` | 145 (cube), 248, 249 (grey) |
| `ccc` | 251, 252 (grey) |
| `ddd` | 7 (base), 188 (cube), 253, 254 (grey) |
| `f00` | 9 (base), 196 (cube) |
| `0f0` | 10 (base), 46 (cube) |
| `0ff` | 14 (base), 51 (cube) |
| `f0f` | 13 (base), 201 (cube) |
| `ff0` | 11 (base), 226 (cube) |
| `fff` | 15 (base), 231 (cube) |

Two adjacent greys in the source can therefore become the same colour,
flattening detail that looked fine in the terminal. Nearly half the grey
ramp collapses in pairs.

**Micron's `` `gNN `` grey ramp is deliberately unused.** It offers 100
levels against 16 and would preserve grey detail much better, but it is a
second code path to keep identical across two implementations. Greys go
through RGB nibbles like everything else. Worth revisiting if greyscale
conversion becomes a priority.

**Attributes are thinner than ANSI.** Faint, blink, conceal,
strikethrough and overline have no Micron equivalent. Reverse video is
applied by swapping the two colours, which works only when both are
explicitly set — against a default on either side there is nothing
concrete to swap to, so it is dropped with a warning.

**Nothing is preserved for later.** Unsupported codes are discarded, not
carried through as text or metadata. Converting is one-way: the `.mu`
output cannot be turned back into the original ANSI.
