# ANSI to Micron mapping

How `src/ansi.js` and `cli/micronart/ansi.py` handle SGR
escape sequences. 

The two implementations were compared across 694 SGR cases and 256 palette indices in both foreground and background,
malformed sequences, attribute toggles in both directions, and
multi-line color carry-over. 

**escaped** mode maintains the color in the original text art. 
**literal** mode disables Micron markup entirely, so every SGR 
sequence is stripped and only glyphs remain. 

## What is recognized

| SGR | Meaning | Result |
|---|---|---|
| `0` | reset | clears colors and all attributes |
| `1` | bold | `` `! `` |
| `2` | faint | dropped, **with a warning** |
| `3` | italic | `` `* `` |
| `4` | underline | `` `_ `` |
| `5`, `6` | blink | dropped, **with a warning** |
| `7` | reverse video | swaps the colors **at emission** |
| `22` | normal intensity | clears bold |
| `23` | italic off | clears italic |
| `24` | underline off | clears underline |
| `27` | reverse off | clears the swap |
| `30`–`37` | foreground, base 8 | `` `F `` + table below |
| `38;5;N` | foreground, 256-color | `` `F `` + cube/gray rules |
| `38;2;R;G;B` | foreground, 24-bit | `` `F `` + quantization |
| `39` | default foreground | `` `f `` |
| `40`–`47` | background, base 8 | `` `B `` + table below |
| `48;5;N`, `48;2;R;G;B` | background | as `38`, but `` `B `` |
| `49` | default background | `` `b `` |
| `90`–`97` | foreground, bright 8 | `` `F `` + table below |
| `100`–`107` | background, bright 8 | `` `B `` + table below |

**Everything else is dropped silently** — That includes `8` (conceal), 
`9` (strikethrough), `21`, `53` (overline).

Warnings are raised for `2`, `5`, `6`, reverse video against a
default color, a malformed extended-color sequence, and a color value
out of range. 

Tags are emitted only when the state changes, not per cell. **Every line
that sets color closes it with `` `` ``.**

The renderer wraps each line in an attribute built from the state at the
*end* of that line, then pads the row out to the terminal width using it. 

Color state does carry across lines in Micron — `` `Ff00RED `` followed
by a plain line renders both red — which is exactly why the leak happens
and why each line has to be closed. Re-emitting the color at the start
of the next line is the price of the art ending where it is drawn.

Art with no color of its own emits nothing here, so a color tag applied
by hand ahead of a converted block still carries across all of its lines.
`examples/gallery.mu` relies on that.

## Turning attributes off

Micron's attribute tags are toggles, so clearing an attribute emits the
same tag a second time:

    ESC[1;3;4m X ESC[22m Y   ->   `!`*`_X`!Y``

`X` is bold, italic and underlined; `Y` keeps the italic and underline
but not the bold.

`27` undoes the color swap that `7` applied:

    ESC[31;42;7m X ESC[27m Y  ->  `F0c0`Bc00X`Fc00`B0c0Y``

`22` corresponds to ECMA-48 "normal intensity", which also clears faint.
Faint is not tracked here.

`7` is idempotent — a second `7` with a swap already applied does
nothing, rather than swapping back. Use `27` for that. 

## Reverse video

Reverse is recorded as state and **resolved when a tag is written**, the
way a terminal treats it: the colors keep the slots they were named for
and the swap happens at draw time.

That matters whenever color and reverse are interleaved. Setting a
foreground while reverse is active puts it in the *background*, because
that is where it ends up once the swap is applied:

    ESC[31;42;7m SWAP ESC[34m LATEFG
      ->  `F0c0`Bc00SWAP`B00eLATEFG

`SWAP` is green on red. `LATEFG` is still green on the *new* color,
because the blue foreground that was set second is what the swap moves
to the background.

Order no longer matters. Reverse before any color works, because
nothing is resolved until emission:

    ESC[7m ESC[31;42m AFTER   ->   `F0c0`Bc00AFTER

`7` is idempotent and `27` simply clears the flag, so `7`/`27` can be
paired in any order without accumulating swaps.

Micron has no reverse attribute, so the swap must be written out as
concrete colors. That is only possible when **both** sides are set.
Swapping against a default would require the document's default color
as an explicit value, which is theme-dependent and not knowable at
conversion time, so a one-sided reverse is dropped with a warning and
the colors are emitted unswapped.

## Malformed extended-color sequences

When `38` or `48` is not followed by a well-formed selector, the rest of
the sequence is **abandoned** and a warning is raised. Nothing is
applied:

| Input | Result |
|---|---|
| `ESC[38;5m` | no color, malformed warning |
| `ESC[38;2;1;2m` | no color, malformed warning |
| `ESC[38;9;1m` | no color, malformed warning |

A color value outside `0`–`255` is treated the same way. `255` is the
last valid palette index; `256` and above are rejected.

| Input | Result |
|---|---|
| `ESC[38;5;255m` | gray 238, `eee` |
| `ESC[38;5;256m` | no color, out-of-range warning |
| `ESC[38;2;300;0;0m` | no color, out-of-range warning |

Only the remainder of that one sequence is discarded. A later, separate
sequence is unaffected — `ESC[38;5mBAD` `ESC[32mGOOD` leaves `BAD`
uncolored and `GOOD` green.

Empty parameter lists and empty fields read as `0`, which is what
ECMA-48 specifies: `ESC[m` is a full reset, and `ESC[1;;2m` is
`1`, `0`, `2` — the empty field resets the bold that preceded it.

## The 16 standard colors

The base 16 are theme-dependent in real terminals. These are pinned 
to **xterm's defaults** so both implementations agree.

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
themed — colors converted from `30`–`37` will not match what you saw on
screen. Convert from truecolor in that case.

## Bold formatting

`1` sets the bold attribute and emits `` `! ``. It **does not** brighten
the foreground.

    ESC[1;31m  ->  `Fc00`!     bold, standard red
    ESC[91m    ->  `Ff00       bright red, not bold

Many terminals render `ESC[1;31m` as bright red, so a capture that relied
on that will come out darker than it looked and bold instead. Whether
NomadNet renders bold as a weight change or as brightness is up to the
client. Art that needs bright colors should use `90`–`97` or truecolor.

## 256-color palette

Indices resolve before quantization:

- **0–15** — the table above.
- **16–231** — the 6×6×6 cube. Index `n - 16` decomposes as
  `36r + 6g + b`, and each component maps through the level table
  `[0, 95, 135, 175, 215, 255]`.
- **232–255** — the gray ramp, `8 + 10 × (n - 232)`, giving 8 to 238.

## 24-bit truecolor

`38;2;R;G;B` is taken directly, then quantized like everything else.

## Quantization

Micron color is three hex nibbles — 4 bits per channel — because the
NomadNet parser reads exactly three characters after `F`/`B`.

    nibble = round(value / 17)
 
Truncation makes every image darker:

| value | `round(v/17)` | `v >> 4` |
|---|---|---|
| 8 | `0` | `0` |
| 9 | `1` | `0` |
| 26 | `2` | `1` |
| 128 | `8` | `8` |
| 255 | `f` | `f` |

Worst-case per-channel error is **8 of 255, about 3.1%**.

## Trade-offs

Converting a 24-bit chafa render is lossy.

**16.7 million colors become 4096.** Each channel keeps 4 bits of the
original 8. Smooth gradients band: adjacent cells that differed by a few
units collapse onto the same nibble.
Small images and flat-color art are converted well; photographic
gradients may be missing the incremental gradient.

**The 256-color palette collapses to 233 Micron colors.** 
17 colors absorb 40 indices. 

| Micron | absorbs |
|---|---|
| `000` | 0 (base), 16 (cube), 232 (gray) |
| `222` | 234, 235 (gray) |
| `333` | 236, 237 (gray) |
| `555` | 239, 240 (gray) |
| `666` | 59 (cube), 241, 242 (gray) |
| `777` | 8 (base), 243 (gray) |
| `888` | 102 (cube), 244, 245 (gray) |
| `999` | 246, 247 (gray) |
| `aaa` | 145 (cube), 248, 249 (gray) |
| `ccc` | 251, 252 (gray) |
| `ddd` | 7 (base), 188 (cube), 253, 254 (gray) |
| `f00` | 9 (base), 196 (cube) |
| `0f0` | 10 (base), 46 (cube) |
| `0ff` | 14 (base), 51 (cube) |
| `f0f` | 13 (base), 201 (cube) |
| `ff0` | 11 (base), 226 (cube) |
| `fff` | 15 (base), 231 (cube) |

Two adjacent grays in the source can therefore become the same color,
flattening detail that looked fine in the terminal. Nearly half the gray
ramp collapses in pairs.

TODO: 

**Micron's `` `gNN `` gray ramp implementation** It offers 100
levels against 16 and would preserve gray detail much better, but it is a
second code path to keep identical across two implementations. Grays go
through RGB nibbles like everything else. Worth revisiting if grayscale
conversion becomes a priority.
