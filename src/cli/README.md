# micronart

Command line converter from ASCII/ANSI art to NomadNet Micron markup.
The browser tool in `src/` does the same job; this is the same logic for
scripting and batch conversion.

Zero runtime dependencies, standard library only.

## Install

    pip install -e src/cli

Or run it straight from the source tree without installing:

    python3 -m micronart --help

## Use

    micronart art.txt                    # literal mode, the default
    micronart -m escaped art.txt         # escaped mode
    chafa image.png | micronart -m escaped

Markup goes to standard output; warnings go to standard error, so
redirecting output keeps them visible.

## Modes

    literal   wrapped in `=, emitted verbatim, monochrome
    escaped   characters escaped in place, colour tags applied

They are not interchangeable and neither is a fallback for the other.
Literal mode is safe for any art but Micron disables markup inside the
block, so colour is impossible. Escaped mode escapes each significant
character in place, which leaves colour and formatting available.

Feed ANSI input to escaped mode to keep the colour. Feeding it to
literal mode is valid and strips every SGR sequence, leaving the glyphs.

## Layout

    micronart/palette.py    colour tables, quantization to Micron's 12-bit space
    micronart/escape.py     normalization, tab expansion, Micron escaping
    micronart/ansi.py       SGR parsing into styled cells
    micronart/converter.py  the two output modes
    micronart/__main__.py   argument handling

Each module mirrors its counterpart in `src/*.js`. If the two disagree,
that is a bug in one of them.

## Tests

    python3 tests/test_converter.py

Runs from the repository root, no test runner required. The file is also
a valid pytest module if you have pytest available.

Tests are driven by `tests/fixtures/`, which is the source of truth for
both implementations. Expected output was verified against the real
NomadNet Micron parser. Never edit a fixture to make a test pass — see
`tests/fixtures/README.md`.
