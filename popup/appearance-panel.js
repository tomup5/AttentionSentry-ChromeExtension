// The settings view: font, background, accent, and text size.

const prefersDark = matchMedia("(prefers-color-scheme: dark)");
const fontSelect = document.getElementById("font");
const backgroundGroup = document.getElementById("background");
const accentGroup = document.getElementById("accent");
const textSizeGroup = document.getElementById("text-size");

function renderAppearance() {
  const { appearance } = settings;
  const palette = applyAppearance(document, appearance, prefersDark.matches, "");
  document.documentElement.style.colorScheme = palette.dark ? "dark" : "light";

  fontSelect.value = appearance.font;
  markSelected(backgroundGroup, appearance.background);
  markSelected(accentGroup, appearance.accent);
  markSelected(textSizeGroup, appearance.textSize);

  // Accent swatches preview the shade that will actually be used on this background.
  for (const swatch of accentGroup.children) {
    swatch.style.background = resolvePalette(
      { background: appearance.background, accent: swatch.dataset.value },
      prefersDark.matches
    ).accent;
  }
}

function markSelected(group, value) {
  for (const option of group.children) {
    const selected = option.dataset.value === value;
    option.setAttribute("aria-checked", selected);
    option.classList.toggle("active", selected);
  }
}

// A radio-style button that sets settings.appearance[setting] = value when clicked.
function radioOption(group, setting, value, label, className) {
  const option = document.createElement("button");
  option.className = className;
  option.dataset.value = value;
  option.title = label;
  option.setAttribute("role", "radio");
  option.setAttribute("aria-label", label);
  option.addEventListener("click", () => {
    settings.appearance[setting] = value;
    update();
  });
  group.append(option);
  return option;
}

function buildAppearanceControls() {
  for (const [key, font] of Object.entries(FONTS)) {
    fontSelect.append(new Option(font.label, key));
  }

  for (const key of BACKGROUND_OPTIONS) {
    const label = key === "auto" ? "Match system" : THEMES[key].label;
    const swatch = radioOption(backgroundGroup, "background", key, label, "swatch");
    swatch.dataset.theme = key;
    if (key !== "auto") swatch.style.background = THEMES[key].bg;
  }

  for (const [key, accent] of Object.entries(ACCENTS)) {
    radioOption(accentGroup, "accent", key, accent.label, "swatch").dataset.accent = key;
  }

  for (const [key, size] of Object.entries(TEXT_SIZES)) {
    radioOption(textSizeGroup, "textSize", key, size.label, "").textContent = size.label;
  }
}

buildAppearanceControls();

fontSelect.addEventListener("change", () => {
  settings.appearance.font = fontSelect.value;
  update();
});

document.getElementById("reset-appearance").addEventListener("click", () => {
  settings.appearance = { ...DEFAULT_SETTINGS.appearance };
  update();
});

prefersDark.addEventListener("change", () => settings && renderAppearance());
