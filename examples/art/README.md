# Example art sources

The raw art the example pages are built from. **These files are the
source; `../index.mu` and `../gallery.mu` are generated output.**

Edit art here, never in the `.mu` files. Anything hand-written into
generated output is lost the next time anyone regenerates.

## Regenerating

From anywhere:

    examples/regenerate.sh

That rebuilds both `.mu` files from this directory in one command. Run it
after any change to the converter — the committed `.mu` files must match
what the script produces byte for byte. If they drift, either the
converter changed behavior or someone edited generated output by hand.
Both are worth knowing about.

The exact conversion commands are repeated as Micron comments at the top
of each generated file, with paths relative to the repository root, so a
single piece can be reproduced without reading the script. Micron drops
comment lines before rendering, so they cost nothing on the page.

## The pieces

| File | Used for |
|---|---|
| `banner.txt` | the banner on the index page, literal mode |
| `gallery-mono.txt` | shown twice — literal, then escaped with a color tag |
| `gallery-color.ans` | ANSI color input, converted in escaped mode |
| `gallery-hazard.txt` | leading dashes, backticks and a leading hash |

`gallery-hazard.txt` appears twice in the gallery: once pasted in raw so
the reader can see it mangled, and once converted. It is deliberately
full of characters Micron treats as block markup.

## Keeping art usable

- **Left align it.** Never center multi-line art with `` `c `` — Micron
  centers each line independently, which shears the shape.
- **Keep it narrow.** There is no hard limit, but art wider than a
  standard terminal wraps and the shape is lost. Everything here is
  under 30 columns, which leaves room for the two-space indent Micron
  applies to content inside a section.
- **Keep it short.** Under 15 lines, so the examples stay readable as
  examples rather than becoming the page.
- Tabs are expanded to stop 4 and carriage returns are stripped during
  conversion, so avoid depending on either for alignment.
