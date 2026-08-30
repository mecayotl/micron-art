# Contributing

## Fixtures first

`tests/fixtures/` is the source of truth. Both implementations read it,
and if they disagree that is a bug in one of them.

So the order is:

1. Write the fixture — an input, and the expected output for both modes
2. Confirm it **fails** against the current code
3. Make both implementations pass it

Step 2 is not ceremony. A fixture that passes before the change tests
nothing, and it is easy to write one by accident.

**Never edit an expected file to make a test pass.** Change it only when
the Micron behaviour it encodes has been re-verified against a real
render, and say so in the commit message.

## Verifying against a real render

Expected output in this repository was checked by rendering it through
NomadNet's own parser and reading the resulting canvas back — glyphs and
style attributes both. That is what establishes a fixture is right,
rather than the implementation grading its own homework.

Reading the parser source is not sufficient on its own. Rendering is what
caught colour bleeding to the terminal edge, and what corrected a wrong
description of how dash-leading lines fail. Both looked fine on paper.

If you have NomadNet installed, import `MicronParser` directly with a
stubbed application object and render your markup.

## Running the tests

    node --test tests/*.test.js
    python3 tests/test_converter.py

No test runner, no dependencies. CI runs both across Python 3.9/3.11/3.13
and Node 18/20/22.

If you touch the converter, rebuild the examples and check nothing moved:

    ./examples/regenerate.sh
    git diff --exit-code examples/

The `.mu` files under `examples/` are generated. Edit the art in
`examples/art/` instead — anything hand-written into generated output is
lost on the next regeneration.

## Keeping the two implementations in step

`src/cli/micronart/*.py` mirrors `src/*.js` module for module. When you
change one, change the other in the same commit.

Watch for these, which have all bitten before:

- **Arrays compare by reference in JavaScript.** `[1,2,3] !== [1,2,3]`,
  while Python compares tuples by value. Colours use an explicit
  component-wise comparison for this reason.
- **`str.expandtabs` has no JavaScript equivalent**, and a fixed-width
  substitution gives different output. Tab expansion is written as an
  explicit column walk in both.
- **The empty string is a substring of everything.** `"" in ">-<#"` is
  `True` in Python and `"".includes("")` is `true` in JavaScript, so
  blank lines need an explicit guard.
- **Width is columns, not characters.** Box-drawing glyphs are one
  column, CJK are two.

## Hard constraints

These are not preferences. Changing any of them changes what the project
is.

- **No npm, no build step, no bundler, zero runtime dependencies.** What
  is in the repository is what runs.
- **Browser code is ES modules in `src/`**, loaded with
  `<script type="module">`. Module imports fail over `file://`, so a
  local server is required: `python3 -m http.server 8000`.
- **The module graph stays flat and acyclic**, in this order:
  `palette -> escape, ansi -> converter -> preview -> app`. A future
  concatenation script would depend on that order.
- **Named exports only** — no default exports, no namespace imports, no
  dynamic `import()`, and all imports at the top of the file.
- **`src/cli/micronart/*.py` mirrors `src/*.js` exactly.** Both read
  `tests/fixtures/`; if they disagree, one of them is wrong.
- **`dist/` is generated.** Never edit it directly.

## Micron rules worth knowing before you start

These were established by rendering markup through NomadNet's own parser,
not by reading its documentation:

- A backtick opens a tag, so a backtick in art becomes `` \` `` and a
  backslash becomes `\\`.
- Line-leading `>` `<` `-` `#` carry block meaning and are mangled or
  deleted unless protected. A leading backslash protects them and is
  consumed, costing zero columns.
- Literal mode (`` `= ``) is safe for any art but disables markup, so it
  is monochrome. Escaped mode keeps colour. They are not
  interchangeable and neither is a fallback for the other.
- Never centre multi-line art with `` `c `` — it centres each line
  independently and shears the shape.

## Style

Match the surrounding code. Comments explain *why*, particularly where
the behaviour is surprising — most of the non-obvious lines in this
project exist because of something specific in the Micron parser, and the
comment is the only record of it.

Commit messages should say what changed and why, and name what was
verified. "Fixed the colour bug" is less useful than the measurement that
proved it was a bug.
