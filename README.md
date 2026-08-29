# micron-art

Convert ASCII and ANSI art into [NomadNet](https://github.com/markqvist/NomadNet)
Micron markup, so it survives being served from a Reticulum node.

**[Open the converter →](https://quetzal-root.github.io/micron-art/)**

<!-- Screenshot: drop a PNG at docs/screenshot.png and uncomment the next line.
![The micron-art converter](docs/screenshot.png)
-->

Micron gives block meaning to the first character of a line. A dash draws
a divider, a hash deletes the line, an angle bracket makes a heading — so
art pasted straight into a `.mu` page is mangled before anyone sees it.
This converts art into markup that renders as drawn.

Browser tool and Python CLI, sharing one set of test fixtures. No build
step, no bundler, zero runtime dependencies.

## Two output modes

They are not interchangeable, and neither is a fallback for the other.

**Literal** wraps the art in `` `= `` and emits it verbatim. Safe for any
art, but Micron disables markup inside the block, so it is monochrome.

**Escaped** protects each significant character in place, which leaves
colour and formatting available. This is the mode that keeps ANSI colour.

## Quick start

In the browser, paste art into [the converter](https://quetzal-root.github.io/micron-art/),
pick a mode, and copy the output.

From the command line:

    pip install -e src/cli

    micronart art.txt                 # literal mode, the default
    micronart -m escaped art.txt      # keeps colour
    chafa image.png | micronart -m escaped

Markup goes to standard output and warnings to standard error, so
redirecting output keeps the warnings visible.

To put a page on a node, write it into the pages directory and restart
NomadNet:

    micronart -m literal art.txt > ~/.nomadnetwork/storage/pages/art.mu

`docs/hosting.md` covers where pages live, why `index.mu` is the default,
and how static and executable pages differ.

## Local development

No install and no build. Serve the repository root and open it:

    python3 -m http.server 8000

Module imports fail over `file://`, so the server is required.

Run the tests:

    node --test tests/*.test.js     # 114 tests
    python3 tests/test_converter.py # 56 tests

Neither needs a test runner or any dependency. Both read
`tests/fixtures/`, which is the source of truth for both
implementations — if they disagree, that is a bug.

After changing the converter, rebuild the example pages and check nothing
moved:

    ./examples/regenerate.sh
    git diff --exit-code examples/

## Layout

    index.html          the browser tool
    src/                browser modules: palette, escape, ansi, converter, preview, app
    src/cli/micronart/  the Python CLI, mirroring src/ module for module
    tests/fixtures/     inputs and expected output, the spec both implementations satisfy
    examples/           a NomadNet index and gallery, generated from examples/art/
    docs/               syntax notes, the ANSI mapping, and hosting

## Documentation

- **`docs/micron-notes.md`** — Micron syntax findings with sources, and why
  the escaping rules are what they are
- **`docs/ansi-mapping.md`** — which SGR codes are handled, the colour
  tables, and what a 24-bit conversion gives up
- **`docs/hosting.md`** — getting a page onto a node
- **`tests/fixtures/README.md`** — the fixture contract

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). The short version: write the
fixture first, then make both implementations pass it. `Claude.md` holds
the hard constraints — no build step, flat module graph, named exports
only, and the Python mirroring the JavaScript exactly.

## Licence

MIT. See [LICENSE](LICENSE).
