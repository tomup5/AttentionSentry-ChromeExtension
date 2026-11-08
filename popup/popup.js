// Popup entry point: holds the settings, renders them, and saves changes. The other
// popup/ scripts each own one part of the page and are loaded before this one.
// Content scripts pick up changes through chrome.storage.onChanged.

const MODES = {
  hint: {
    label: "Hint",
    description: "Show a short note explaining the pattern. Nothing is removed."
  },
  pause: { label: "Pause", description: "Pause with a brief countdown before you can continue." },
  block: {
    label: "Block",
    description: "Stop endless feeds, remove recommendations, and keep blocked sites closed."
  }
};

let settings;

const mainView = document.getElementById("main-view");
const settingsView = document.getElementById("settings-view");
const studyModeInput = document.getElementById("studyMode");
const statusText = document.getElementById("status-text");
const controls = document.getElementById("controls");
const modeButtons = document.querySelectorAll("#mode button");
const modeDesc = document.getElementById("mode-desc");
const saveError = document.getElementById("save-error");

function render() {
  studyModeInput.checked = settings.studyMode;
  statusText.textContent = settings.studyMode ? `On · ${MODES[settings.mode].label}` : "Off";
  controls.classList.toggle("disabled", !settings.studyMode);

  modeButtons.forEach((btn) => {
    const active = btn.dataset.mode === settings.mode;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-checked", active);
  });
  modeDesc.textContent = MODES[settings.mode].description;

  featureInputs.forEach((input) => {
    const [site, key] = input.dataset.setting.split(".");
    const value = settings[site][key];
    if (input.type === "checkbox") input.checked = value;
    else input.value = value;
  });

  // "n of m on" counts each row's main switch, not sub-options or the header switch.
  for (const { key } of SITE_SECTIONS) {
    const section = document.querySelector(`[data-section="${key}"]`);
    const features = [...section.querySelectorAll(".row > .switch input")];
    const on = features.filter((input) => input.checked).length;
    const enabled = settings[key].enabled;
    section.querySelector(".count").textContent = enabled
      ? `${on} of ${features.length} on`
      : "Off";
    section.querySelector(".site-body").classList.toggle("disabled", !enabled);
  }

  renderOrder();
  renderSites();
  renderAppearance();
}

// A failed save (usually a chrome.storage.sync quota) puts the popup back in step
// with what's actually stored, so it never shows a change that didn't happen.
async function update() {
  const { settings: current, error } = await persistSettings(settings);
  settings = current;
  saveError.hidden = !error;
  render();
}

// Number inputs carry their own min and max; anything unparseable falls back to the default.
function clampNumber(input, site, key) {
  const n = parseInt(input.value, 10);
  if (isNaN(n)) return DEFAULT_SETTINGS[site][key];
  return Math.min(Number(input.max), Math.max(Number(input.min), n));
}

function showView(view) {
  mainView.hidden = view !== mainView;
  settingsView.hidden = view !== settingsView;
}

// --- Startup ---
// The site sections are built first so the listeners below can find their inputs.

buildSiteSections();

studyModeInput.addEventListener("change", () => {
  settings.studyMode = studyModeInput.checked;
  update();
});

modeButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    settings.mode = btn.dataset.mode;
    update();
  });
});

featureInputs.forEach((input) => {
  input.addEventListener("change", () => {
    const [site, key] = input.dataset.setting.split(".");
    settings[site][key] = input.type === "checkbox" ? input.checked : clampNumber(input, site, key);
    update();
  });
});

document.querySelectorAll(".site-toggle").forEach((toggle) => {
  toggle.addEventListener("click", () =>
    toggleSection(toggle.closest("[data-section]").dataset.section)
  );
});

document.getElementById("open-settings").addEventListener("click", () => showView(settingsView));
document.getElementById("close-settings").addEventListener("click", () => showView(mainView));

Promise.all([
  loadSettings(),
  chrome.storage.local.get([
    STORAGE_KEYS.OPEN_SECTIONS,
    STORAGE_KEYS.SAVED_TANGENTS,
    STORAGE_KEYS.STUDY_CHANNELS
  ])
]).then(([loaded, local]) => {
  settings = loaded;
  openSections = local[STORAGE_KEYS.OPEN_SECTIONS] ?? [];
  render();
  renderSections();
  renderSavedTangents(local[STORAGE_KEYS.SAVED_TANGENTS]);
  renderStudyChannels(local[STORAGE_KEYS.STUDY_CHANNELS]);
});
renderSession();
