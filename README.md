# micron-art

Convert ASCII and ANSI art into [NomadNet](https://github.com/markqvist/NomadNet)
Micron markup, so we can have neat art on our Reticulum pages.

**[Open the converter →](https://quetzal-root.github.io/micron-art/)**

![The converter with ASCII art loaded in literal mode, showing the art, the generated Micron and a preview of how it renders](docs/screenshot.png)

ASCII art breaks when pasted into a .mu file. 
Micron reads certain leading characters as formatting commands:
- becomes a divider, # deletes the line, and > becomes a heading.
This tool escapes them so ASCII & ANSI art renders as drawn.

A browser tool and Python CLI is provided. They share a set of fixed inputs 
that are tested against, and are also tested against the expected output.
There's no build step, no bundler, zero runtime dependencies.

## Two output modes
**Literal** wraps the art in `` `= `` and displays it as it's originally seen.

**Escaped** protects color and formatting of the original text art.
This is the mode that keeps ANSI color.

![ANSI art converted in escaped mode, with the preview showing the image rendered in colour](docs/screenshot-color.png)

Above: `chafa` output pasted in, converted in escaped mode. The preview
reads the generated markup back through a Micron reader, so it shows what
NomadNet will render rather than a copy of the input.

## Quick start

In the browser, paste ANSI or ASCII text art into [the converter](https://quetzal-root.github.io/micron-art/),
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

`docs/hosting.md` covers where pages are stored, why `index.mu` is the default,
and how static and executable pages differ.

## Local development

No install and no build. Serve the repository root and open it:

    python3 -m http.server 8000

Module imports fail over `file://`, so the server is required.

Run the tests:

    node --test tests/*.test.js     # 114 tests
    python3 tests/test_converter.py # 56 tests

Both tests read `tests/fixtures/`.

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
