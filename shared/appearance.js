// Font and color themes, shared by the popup and the on-page UI.
// Fonts are bundled rather than loaded from a CDN so the extension makes no network requests.

const FONTS = {
  system: {
    label: "System default",
    stack: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
  },
  inter: {
    label: "Inter",
    stack: '"SM Inter", system-ui, sans-serif',
    faces: [{ file: "inter.woff2", weight: "400 700" }]
  },
  roboto: {
    label: "Roboto",
    stack: '"SM Roboto", system-ui, sans-serif',
    faces: [{ file: "roboto.woff2", weight: "400 700" }]
  },
  openSans: {
    label: "Open Sans",
    stack: '"SM Open Sans", system-ui, sans-serif',
    faces: [{ file: "open-sans.woff2", weight: "400 700" }]
  },
  lato: {
    label: "Lato",
    stack: '"SM Lato", system-ui, sans-serif',
    faces: [
      { file: "lato-400.woff2", weight: "400" },
      { file: "lato-700.woff2", weight: "700" }
    ]
  },
  montserrat: {
    label: "Montserrat",
    stack: '"SM Montserrat", system-ui, sans-serif',
    faces: [{ file: "montserrat.woff2", weight: "400 700" }]
  },
  poppins: {
    label: "Poppins",
    stack: '"SM Poppins", system-ui, sans-serif',
    faces: [
      { file: "poppins-400.woff2", weight: "400" },
      { file: "poppins-600.woff2", weight: "600" },
      { file: "poppins-700.woff2", weight: "700" }
    ]
  },
  georgia: {
    label: "Georgia",
    stack: 'Georgia, "Times New Roman", serif'
  }
};

const THEMES = {
  light: {
    label: "White",
    bg: "#fdfcfa",
    text: "#231f1b",
    muted: "#6c665d",
    border: "#dedad1",
    accent: "#2c5f78",
    onAccent: "#ffffff"
  },
  paper: {
    label: "Paper",
    bg: "#f5f1e8",
    text: "#2a2620",
    muted: "#6f685c",
    border: "#ddd5c4",
    accent: "#8f4a22",
    onAccent: "#ffffff"
  },
  sage: {
    label: "Sage",
    bg: "#edf0e8",
    text: "#1f271e",
    muted: "#5d6a5b",
    border: "#d3dbcd",
    accent: "#40693f",
    onAccent: "#ffffff"
  },
  dark: {
    label: "Dark",
    dark: true,
    bg: "#1e1d1b",
    text: "#ebe8e2",
    muted: "#9a958c",
    border: "#34322e",
    accent: "#8db4c9",
    onAccent: "#12181c"
  },
  midnight: {
    label: "Midnight",
    dark: true,
    bg: "#141a24",
    text: "#e2e6ec",
    muted: "#8c95a6",
    border: "#262e3c",
    accent: "#92b0d6",
    onAccent: "#0e1422"
  }
};

// "auto" follows the host's light or dark mode.
const BACKGROUND_OPTIONS = ["auto", ...Object.keys(THEMES)];

// "theme" keeps each background's own accent. Others have a lighter
// variant for dark backgrounds so they keep enough contrast.
const ACCENTS = {
  theme: { label: "Theme default" },
  blue: { label: "Blue", light: "#2c5f78", dark: "#8db4c9" },
  teal: { label: "Teal", light: "#236a62", dark: "#7cc4b6" },
  green: { label: "Green", light: "#3d6e32", dark: "#9ac98a" },
  orange: { label: "Orange", light: "#b4501e", dark: "#e8a674" },
  rose: { label: "Rose", light: "#a8334f", dark: "#e49aac" },
  purple: { label: "Purple", light: "#5b4a8c", dark: "#b8aedb" },
  graphite: { label: "Graphite", light: "#3d3a36", dark: "#d2cec7" }
};

// Scales the text of the on-page prompts.
const TEXT_SIZES = {
  small: { label: "Small", scale: 0.9 },
  default: { label: "Default", scale: 1 },
  large: { label: "Large", scale: 1.15 }
};

function resolveTheme(background, prefersDark) {
  if (background === "auto" || !THEMES[background]) {
    return prefersDark ? THEMES.dark : THEMES.light;
  }
  return THEMES[background];
}

function resolvePalette({ background, accent }, prefersDark) {
  const theme = resolveTheme(background, prefersDark);
  const custom = ACCENTS[accent];
  if (!custom?.light) return theme;
  return {
    ...theme,
    accent: theme.dark ? custom.dark : custom.light,
    onAccent: theme.dark ? "#111318" : "#ffffff"
  };
}

// Sets colors, font, and text scale as CSS custom properties on `el` (e.g. --sm-bg),
// and loads the font. Returns the resolved palette.
function applyAppearance(el, appearance, prefersDark, prefix) {
  const palette = resolvePalette(appearance, prefersDark);
  const font = FONTS[appearance.font] ?? FONTS.system;
  const scale = TEXT_SIZES[appearance.textSize]?.scale ?? 1;

  for (const key of ["bg", "text", "muted", "border", "accent", "onAccent"]) {
    el.style.setProperty(`--${prefix}${key}`, palette[key]);
  }
  el.style.setProperty(`--${prefix}font`, font.stack);
  el.style.setProperty(`--${prefix}scale`, scale);
  applyFontFaces(el.ownerDocument, font);
  return palette;
}

// @font-face rules for one font, so only the selected font is ever loaded.
function fontFaceCss(font) {
  const family = font.stack.match(/^"([^"]+)"/)?.[1];
  if (!family || !font.faces) return "";
  return font.faces
    .map(
      (face) => `@font-face {
  font-family: "${family}";
  src: url("${chrome.runtime.getURL(`fonts/${face.file}`)}") format("woff2");
  font-weight: ${face.weight};
  font-display: swap;
}`
    )
    .join("\n");
}

function applyFontFaces(doc, font) {
  let style = doc.getElementById("sm-font-faces");
  if (!style) {
    style = doc.createElement("style");
    style.id = "sm-font-faces";
    doc.head.append(style);
  }
  style.textContent = fontFaceCss(font);
}
