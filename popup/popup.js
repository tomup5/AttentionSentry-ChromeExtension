// Popup entry point. Holds the settings and saves them. The other scripts in here
// each handle one part of the page and have to load first.

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

/** @type {Settings} */
let settings;

const mainView = document.getElementById("main-view");
const settingsView = document.getElementById("settings-view");
const studyModeInput = /** @type {HTMLInputElement} */ (document.getElementById("studyMode"));
const statusText = document.getElementById("status-text");
const controls = document.getElementById("controls");
const modeButtons = /** @type {NodeListOf<HTMLButtonElement>} */ (
  document.querySelectorAll("#mode button")
);
const modeDesc = document.getElementById("mode-desc");
const saveError = document.getElementById("save-error");

function render() {
  studyModeInput.checked = settings.studyMode;
  statusText.textContent = settings.studyMode ? `On · ${MODES[settings.mode].label}` : "Off";
  controls.classList.toggle("disabled", !settings.studyMode);

  modeButtons.forEach((btn) => {
    const active = btn.dataset.mode === settings.mode;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-checked", String(active));
  });
  modeDesc.textContent = MODES[settings.mode].description;

  featureInputs.forEach((input) => {
    const [site, key] = input.dataset.setting.split(".");
    const value = settings[site][key];
    if (input.type === "checkbox") input.checked = value;
    else input.value = value;
  });

  // counts each row's main switch, not sub-options or the header
  for (const { key } of SITE_SECTIONS) {
    const section = document.querySelector(`[data-section="${key}"]`);
    const features = /** @type {HTMLInputElement[]} */ ([
      ...section.querySelectorAll(".row > .switch input")
    ]);
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

// Saves can fail (usually the sync quota). Go back to what's stored so the popup
// doesn't show a change that never happened.
async function update() {
  const { settings: current, error } = await persistSettings(settings);
  settings = current;
  saveError.hidden = !error;
  render();
}

// Falls back to the default if it can't be parsed
function clampNumber(input, site, key) {
  const n = parseInt(input.value, 10);
  if (isNaN(n)) return DEFAULT_SETTINGS[site][key];
  return Math.min(Number(input.max), Math.max(Number(input.min), n));
}

function showView(view) {
  mainView.hidden = view !== mainView;
  settingsView.hidden = view !== settingsView;
}

// Sections have to exist before the listeners below can find their inputs

buildSiteSections();

studyModeInput.addEventListener("change", () => {
  settings.studyMode = studyModeInput.checked;
  update();
});

modeButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    settings.mode = /** @type {Mode} */ (btn.dataset.mode);
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
    toggleSection(/** @type {HTMLElement} */ (toggle.closest("[data-section]")).dataset.section)
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
]).then(
  /** @param {[Settings, Record<string, any>]} results */ ([loaded, local]) => {
    settings = loaded;
    openSections = local[STORAGE_KEYS.OPEN_SECTIONS] ?? [];
    render();
    renderSections();
    renderSavedTangents(local[STORAGE_KEYS.SAVED_TANGENTS]);
    renderStudyChannels(local[STORAGE_KEYS.STUDY_CHANNELS]);
  }
);
renderSession();
