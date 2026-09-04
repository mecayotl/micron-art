// DOM wiring for the browser tool.
//
// Holds no conversion logic of its own: everything comes from
// converter.js and preview.js, which are the modules the tests cover.
//
// Mirrors nothing on the Python side -- the CLI has no UI.

import { ESCAPED, LITERAL, convert } from "./converter.js";
import { SECTION_INDENT, micronColorToCss, renderPreview } from "./preview.js";

const SAMPLE = [
  "   /\\_/\\",
  "  ( o.o )",
  "   > ^ <",
  "",
  "--- MENU ---",
  "- new game",
  "- quit",
  "# not a comment",
  "`= literal-looking line",
].join("\n");

const elements = {
  art: document.getElementById("art"),
  output: document.getElementById("output"),
  preview: document.getElementById("preview"),
  warnings: document.getElementById("warnings"),
  file: document.getElementById("file"),
  copy: document.getElementById("copy"),
  download: document.getElementById("download"),
  sample: document.getElementById("sample"),
  clear: document.getElementById("clear"),
};

function selectedMode() {
  const checked = document.querySelector('input[name="mode"]:checked');
  return checked && checked.value === ESCAPED ? ESCAPED : LITERAL;
}

// Build one preview row. Text is set through textContent throughout, so
// art containing markup-like characters cannot inject nodes.
function previewRow(line) {
  const row = document.createElement("div");
  row.className = `preview-line preview-${line.kind}`;

  if (line.kind === "divider") {
    row.textContent = line.char.repeat(48);
    row.classList.add("preview-divider");
    return row;
  }

  if (line.align === "center" || line.align === "right") {
    row.style.textAlign = line.align;
  }
  if (line.depth > 0) {
    row.style.paddingLeft = `${line.depth * SECTION_INDENT}ch`;
  }

  if (line.segments.length === 0) {
    // Keep the row's height; an empty div collapses.
    row.appendChild(document.createTextNode(" "));
    return row;
  }

  for (const segment of line.segments) {
    const span = document.createElement("span");
    span.textContent = segment.text;
    const fg = micronColorToCss(segment.fg);
    const bg = micronColorToCss(segment.bg);
    if (fg) span.style.color = fg;
    if (bg) span.style.backgroundColor = bg;
    if (segment.bold) span.style.fontWeight = "bold";
    if (segment.italic) span.style.fontStyle = "italic";
    if (segment.underline) span.style.textDecoration = "underline";
    row.appendChild(span);
  }
  return row;
}

function renderWarnings(warnings) {
  const unique = [...new Set(warnings)];
  elements.warnings.textContent = "";
  elements.warnings.hidden = unique.length === 0;
  if (unique.length === 0) return;
  const list = document.createElement("ul");
  for (const warning of unique) {
    const item = document.createElement("li");
    item.textContent = warning;
    list.appendChild(item);
  }
  elements.warnings.appendChild(list);
}

function update() {
  const raw = elements.art.value;
  const mode = selectedMode();

  let markup;
  let warnings;
  try {
    ({ markup, warnings } = convert(raw, mode));
  } catch (error) {
    elements.output.value = "";
    elements.preview.textContent = "";
    renderWarnings([`conversion failed: ${error.message}`]);
    return;
  }

  elements.output.value = markup;
  renderWarnings(warnings);

  const lines = renderPreview(markup.replace(/\n$/, ""));
  const fragment = document.createDocumentFragment();
  for (const line of lines) fragment.appendChild(previewRow(line));
  elements.preview.textContent = "";
  elements.preview.appendChild(fragment);

}

function download() {
  const blob = new Blob([elements.output.value], {
    type: "text/plain;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `art.${selectedMode()}.mu`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function copy() {
  const text = elements.output.value;
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    flash(elements.copy, "Copied");
  } catch {
    // Clipboard access needs a secure context and can be refused.
    elements.output.select();
    flash(elements.copy, "Select and copy");
  }
}

function flash(button, message) {
  const original = button.textContent;
  button.textContent = message;
  button.disabled = true;
  setTimeout(() => {
    button.textContent = original;
    button.disabled = false;
  }, 1200);
}

function loadFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    elements.art.value = String(reader.result);
    update();
  };
  reader.readAsText(file);
}

elements.art.addEventListener("input", update);
for (const radio of document.querySelectorAll('input[name="mode"]')) {
  radio.addEventListener("change", update);
}
elements.file.addEventListener("change", (event) => {
  loadFile(event.target.files[0]);
  event.target.value = "";
});
elements.copy.addEventListener("click", copy);
elements.download.addEventListener("click", download);
elements.sample.addEventListener("click", () => {
  elements.art.value = SAMPLE;
  update();
});
elements.clear.addEventListener("click", () => {
  elements.art.value = "";
  update();
});

// Dropping a file anywhere on the page loads it.
document.addEventListener("dragover", (event) => event.preventDefault());
document.addEventListener("drop", (event) => {
  event.preventDefault();
  loadFile(event.dataTransfer && event.dataTransfer.files[0]);
});

elements.art.value = SAMPLE;
update();
