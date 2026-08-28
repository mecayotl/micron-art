# micron-art

Browser tool + Python CLI that converts ASCII/ANSI art into NomadNet
Micron (.mu) markup. Site is static, hosted on GitHub Pages from root.

## Hard constraints

- No npm, no build step, no bundler. Zero runtime dependencies.
- Browser code is ES modules in `src/`, loaded via
  `<script type="module">`. Dev server: `python3 -m http.server 8000`
  (module imports fail over file://).
- Module graph must stay FLAT and ACYCLIC. Current order:
  palette.js -> escape.js, ansi.js -> converter.js -> preview.js -> app.js
  A future concat script assumes this order.
- Named exports only. No `export default`, no `import * as`,
  no dynamic import(). All imports at top of file.
- `cli/micronart/*.py` mirrors `src/*.js` logic exactly.
  Both read `tests/fixtures/` — if they disagree, that's a bug.

## Micron escaping rules (non-obvious)

- Backtick is Micron's escape char: ` -> \` and \ -> \\
- Line-leading `>` `<` `-` `#` have block meaning and must be
  protected or the line is mangled/deleted.
- Literal mode (`=) is safe but disables color. Two output modes:
  literal (monochrome) and escaped (colorizable). Not interchangeable.
- Never center multi-line art with `c — it centers each line
  independently and shears the shape.
- Warn above 130 chars/line (MeshChat limit).

## Workflow

Write the fixture first, then make both implementations pass it.
`dist/` is generated — never edit it directly.