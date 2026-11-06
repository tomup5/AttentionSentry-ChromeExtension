// Popup: renders the current settings and saves changes.
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

// One collapsible section per site. Each feature is a row with a switch for
// settings[site][key]; `sub` adds a checkbox or number below the description,
// and `extra` names a list built by buildExtra().
const SITE_SECTIONS = [
  {
    key: "youtube",
    name: "YouTube",
    features: [
      { key: "intention", title: "Intention check", desc: "Ask why you're opening YouTube before it loads." },
      {
        key: "hideMetrics",
        title: "Hide metrics",
        desc: "Hide views, likes, and subscriber counts.",
        sub: { type: "checkbox", key: "blurThumbnails", label: "Blur thumbnails until hover" }
      },
      {
        key: "scrollNudge",
        title: "Scroll limit",
        desc: "Step in after a long scroll through the feed or Shorts.",
        sub: { type: "number", key: "scrollScreens", min: 3, max: 100, before: "After", after: "screens" }
      },
      { key: "rabbitHole", title: "Rabbit-hole guard", desc: "Turn off autoplay and check in between videos." }
    ]
  },
  {
    key: "reddit",
    name: "Reddit",
    features: [
      { key: "intention", title: "Intention check", desc: "Ask why you're here when you open the home or Popular feed." },
      { key: "hideMetrics", title: "Hide metrics", desc: "Hide upvotes, comment counts, members, and karma." },
      {
        key: "scrollNudge",
        title: "Scroll limit",
        desc: "Step in after a long scroll through a feed.",
        sub: { type: "number", key: "scrollScreens", min: 3, max: 100, before: "After", after: "screens" }
      },
      { key: "hideSidebars", title: "Hide sidebars", desc: "Hide Popular, Explore, Recent, and the right-hand column." }
    ]
  },
  {
    key: "wikipedia",
    name: "Wikipedia",
    features: [
      {
        key: "rabbitHole",
        title: "Rabbit-hole tracker",
        desc: "Count the links you follow away from where you started, and check in.",
        sub: { type: "number", key: "hopLimit", min: 2, max: 50, before: "After", after: "links" },
        sub2: { type: "checkbox", key: "topicBadge", label: "Show a link back to where you started" }
      },
      {
        key: "saveTangents",
        title: "Save tangents",
        desc: "Hover a link to save it for after you study.",
        extra: "savedTangents"
      },
      { key: "hideMainPage", title: "Hide Main Page extras", desc: "Hide Did you know, In the news, and Random article." }
    ]
  },
  {
    key: "discord",
    name: "Discord",
    features: [
      {
        key: "studyChannels",
        title: "Study-channel focus",
        desc: "Mark the channels you study in. Others are dimmed and check in when you open them.",
        extra: "studyChannels"
      },
      { key: "hideBadges", title: "Hide unread badges", desc: "Hide mention counts and unread dots on servers." }
    ]
  },
  {
    key: "nyt",
    name: "New York Times",
    features: [
      { key: "intention", title: "Intention check", desc: "Ask why you're here when you open the front page." },
      { key: "games", title: "Games check", desc: "Step in before Wordle, Connections, and other games." },
      {
        key: "articleCheck",
        title: "Article check-in",
        desc: "Check in once you've read several articles.",
        sub: { type: "number", key: "articleLimit", min: 2, max: 50, before: "From article", after: "on" }
      },
      { key: "hideRecirc", title: "Hide 'More to read'", desc: "Hide Most Popular, Trending, and recommended articles." }
    ]
  }
];

// What a blocked site does in each strictness mode (see blocked/blocked.js).
const SITE_MODE_NOTES = {
  hint: "Blocked sites show a reminder with an Open anyway button.",
  pause: `Blocked sites can open for ${UNLOCK_MINUTES} minutes after a short wait.`,
  block: "Blocked sites stay closed until you turn Attention Guard off."
};

// Keeps the settings object well under chrome.storage.sync's per-item size limit.
const MAX_CUSTOM_SITES = 50;

const prefersDark = matchMedia("(prefers-color-scheme: dark)");

let settings;
// Keys of the expanded sections, remembered in chrome.storage.local.
let openSections = [];

const mainView = document.getElementById("main-view");
const settingsView = document.getElementById("settings-view");
const studyModeInput = document.getElementById("studyMode");
const statusText = document.getElementById("status-text");
const controls = document.getElementById("controls");
const modeButtons = document.querySelectorAll("#mode button");
const modeDesc = document.getElementById("mode-desc");
const fontSelect = document.getElementById("font");
const backgroundGroup = document.getElementById("background");
const accentGroup = document.getElementById("accent");
const textSizeGroup = document.getElementById("text-size");
const sessionSection = document.getElementById("session");
const sessionTitle = sessionSection.querySelector(".section-title");
const sessionGoal = document.getElementById("session-goal");
const sessionStats = document.getElementById("session-stats");
const blockerSection = document.querySelector('[data-section="siteBlock"]');
const siteBlockInput = document.getElementById("siteBlock");
const sitesCount = document.getElementById("sites-count");
const sitesDesc = document.getElementById("sites-desc");
const siteOptions = document.getElementById("site-options");
const siteList = document.getElementById("site-list");
const addSiteForm = document.getElementById("add-site");
const addSiteInput = document.getElementById("add-site-input");
const addSiteError = document.getElementById("add-site-error");
const siteAccess = document.getElementById("site-access");

// Filled in by buildSiteSections().
// Each [data-setting] input maps to settings[site][key], written "site.key".
let featureInputs = [];
const lists = {};

// el("p", { class: "x", text: "hi", onclick: fn }, child1, child2), as in content/ui.js.
function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value);
  }
  for (const child of children) {
    if (child) node.append(child);
  }
  return node;
}

// --- Building the site sections ---

function switchControl(setting, label) {
  return el(
    "label",
    { class: "switch" },
    el("input", { type: "checkbox", "data-setting": setting, "aria-label": label }),
    el("span", { class: "slider" })
  );
}

function subOption(site, sub) {
  const setting = `${site}.${sub.key}`;
  if (sub.type === "checkbox") {
    return el(
      "label",
      { class: "sub-option" },
      el("input", { type: "checkbox", "data-setting": setting }),
      sub.label
    );
  }
  return el(
    "label",
    { class: "sub-option" },
    sub.before,
    el("input", { type: "number", min: sub.min, max: sub.max, "data-setting": setting }),
    sub.after
  );
}

// Lists kept in chrome.storage.local by the content scripts.
function buildExtra(name) {
  if (name === "savedTangents") {
    lists.savedTangents = el("ul");
    return el(
      "div",
      { class: "saved", id: "saved-tangents", hidden: "" },
      el(
        "div",
        { class: "saved-head" },
        el("span", { text: "Saved for later" }),
        el("button", { class: "text-button", type: "button", text: "Clear", onclick: clearSavedTangents })
      ),
      lists.savedTangents
    );
  }
  lists.studyChannels = el("ul");
  lists.studyChannelsEmpty = el("p", {
    class: "saved-empty",
    text: "None yet. Open a channel in Discord and click “Mark as study channel”."
  });
  return el(
    "div",
    { class: "saved" },
    el("div", { class: "saved-head" }, el("span", { text: "Study channels" })),
    lists.studyChannels,
    lists.studyChannelsEmpty
  );
}

function featureRow(site, feature) {
  return el(
    "div",
    { class: "row" },
    el(
      "div",
      { class: "row-text" },
      el("h3", { text: feature.title }),
      el("p", { text: feature.desc }),
      feature.sub && subOption(site, feature.sub),
      feature.sub2 && subOption(site, feature.sub2),
      feature.extra && buildExtra(feature.extra)
    ),
    switchControl(`${site}.${feature.key}`, feature.title)
  );
}

function buildSiteSections() {
  const chevron = blockerSection.querySelector(".chevron");
  for (const site of SITE_SECTIONS) {
    const head = el(
      "div",
      { class: "site-head" },
      el(
        "button",
        { class: "site-toggle", type: "button", "aria-expanded": "false" },
        chevron.cloneNode(true),
        el("span", { class: "site-name", text: site.name }),
        el("span", { class: "count" })
      ),
      switchControl(`${site.key}.enabled`, `${site.name} features`)
    );
    head.querySelector(".switch").title = `Turn ${site.name} features on or off`;

    const body = el("div", { class: "site-body", hidden: "" });
    body.append(...site.features.map((feature) => featureRow(site.key, feature)));
    blockerSection.before(el("section", { class: "section site", "data-section": site.key }, head, body));
  }
  featureInputs = document.querySelectorAll("[data-setting]");
}

// --- Rendering ---

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
    section.querySelector(".count").textContent = enabled ? `${on} of ${features.length} on` : "Off";
    section.querySelector(".site-body").classList.toggle("disabled", !enabled);
  }

  renderSites();
  renderAppearance();
}

function renderSections() {
  for (const section of document.querySelectorAll("[data-section]")) {
    const open = openSections.includes(section.dataset.section);
    section.querySelector(".site-body").hidden = !open;
    section.querySelector(".site-toggle").setAttribute("aria-expanded", open);
  }
}

function toggleSection(key) {
  openSections = openSections.includes(key)
    ? openSections.filter((k) => k !== key)
    : [...openSections, key];
  chrome.storage.local.set({ openSections });
  renderSections();
}

function renderSites() {
  const { siteBlock } = settings;
  siteBlockInput.checked = siteBlock.enabled;
  siteOptions.classList.toggle("disabled", !siteBlock.enabled);
  sitesDesc.textContent = SITE_MODE_NOTES[settings.mode];
  sitesCount.textContent = siteBlock.enabled ? `${chosenSites(settings).length} blocked` : "Off";

  // Built-in sites are created once; custom ones are rebuilt since they come and go.
  siteList.querySelectorAll(".custom").forEach((node) => node.remove());
  siteBlock.custom.forEach((domain) => siteList.append(siteOption(customSite(domain), true)));
  for (const input of siteList.querySelectorAll("input")) {
    input.checked = !siteBlock.excluded.includes(input.dataset.site);
  }

  renderSiteAccess();
}

// Shown when some chosen sites can only be blocked with Chrome's error page,
// because the user didn't grant access to redirect them.
async function renderSiteAccess() {
  const origins = chosenSites(settings).flatMap((site) => site.domains).map(originPattern);
  const granted = !origins.length || (await chrome.permissions.contains({ origins }));
  siteAccess.hidden = granted || !settings.siteBlock.enabled;
}

function siteOption(site, removable) {
  const option = el(
    "label",
    { class: removable ? "site-option custom" : "site-option" },
    el("input", { type: "checkbox", "data-site": site.id }),
    el("span", { text: site.label, title: site.label })
  );

  if (removable) {
    option.append(
      removeButton(site.label, (e) => {
        e.preventDefault(); // don't toggle the checkbox in the same label
        settings.siteBlock.custom = settings.siteBlock.custom.filter((d) => d !== site.domains[0]);
        settings.siteBlock.excluded = settings.siteBlock.excluded.filter((id) => id !== site.id);
        update();
      })
    );
  }
  return option;
}

function removeButton(label, onclick) {
  return el("button", {
    type: "button",
    class: "site-remove",
    text: "×",
    title: `Remove ${label}`,
    "aria-label": `Remove ${label}`,
    onclick
  });
}

// Ask for access to the sites so they can be redirected to the Attention Guard page.
// Must be called straight from a click handler: Chrome only shows the prompt
// in response to a user gesture. The popup may close while the prompt is open,
// so callers save their settings first.
function requestSiteAccess(sites) {
  const origins = sites.flatMap((site) => site.domains).map(originPattern);
  if (!origins.length) return;
  chrome.permissions
    .request({ origins })
    .catch(() => {})
    .then(() => settings && renderSiteAccess());
}

function showAddSiteError(message) {
  addSiteError.textContent = message;
  addSiteError.hidden = false;
}

// --- Saved lists (Wikipedia tangents, Discord study channels) ---

function isWikipediaUrl(raw) {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && /(^|\.)wikipedia\.org$/.test(url.hostname);
  } catch {
    return false;
  }
}

function renderSavedTangents(saved = []) {
  document.getElementById("saved-tangents").hidden = !saved.length;
  lists.savedTangents.replaceChildren(
    ...saved.map((item) =>
      el(
        "li",
        {},
        el("button", {
          type: "button",
          class: "text-button saved-name",
          text: item.title,
          title: `${item.title}, saved while reading about ${item.from}`,
          onclick: () => isWikipediaUrl(item.url) && chrome.tabs.create({ url: item.url })
        }),
        removeButton(item.title, () => removeSavedTangent(item.url))
      )
    )
  );
}

async function removeSavedTangent(url) {
  const { savedTangents = [] } = await chrome.storage.local.get("savedTangents");
  await chrome.storage.local.set({ savedTangents: savedTangents.filter((i) => i.url !== url) });
}

function clearSavedTangents() {
  chrome.storage.local.set({ savedTangents: [] });
}

function renderStudyChannels(channels = []) {
  lists.studyChannelsEmpty.hidden = channels.length > 0;
  lists.studyChannels.replaceChildren(
    ...channels.map((c) =>
      el(
        "li",
        {},
        el("span", { class: "saved-name", text: c.server ? `${c.name} · ${c.server}` : c.name }),
        removeButton(c.name, () => removeStudyChannel(c.channel))
      )
    )
  );
}

async function removeStudyChannel(channel) {
  const { discordStudyChannels = [] } = await chrome.storage.local.get("discordStudyChannels");
  await chrome.storage.local.set({
    discordStudyChannels: discordStudyChannels.filter((c) => c.channel !== channel)
  });
}

// --- Appearance ---

function renderAppearance() {
  const { appearance } = settings;
  const palette = applyAppearance(document.documentElement, appearance, prefersDark.matches, "");
  document.documentElement.style.colorScheme = palette.dark ? "dark" : "light";

  fontSelect.value = appearance.font;
  markSelected(backgroundGroup, appearance.background);
  markSelected(accentGroup, appearance.accent);
  markSelected(textSizeGroup, appearance.textSize);

  // Accent swatches preview the shade that will actually be used on this background.
  for (const swatch of accentGroup.children) {
    const accent = ACCENTS[swatch.dataset.value];
    swatch.style.background = accent.light
      ? palette.dark
        ? accent.dark
        : accent.light
      : resolveTheme(appearance.background, prefersDark.matches).accent;
  }
}

function markSelected(group, value) {
  for (const option of group.children) {
    const selected = option.dataset.value === value;
    option.setAttribute("aria-checked", selected);
    option.classList.toggle("active", selected);
  }
}

// --- Session ---

// Session data is written by the content scripts into chrome.storage.session,
// keyed by tab, with one slot per site and `lastSite` naming the current one.
async function renderSession() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const key = tab && `tab-${tab.id}`;
  const entry = key ? (await chrome.storage.session.get(key))[key] : null;
  const site = SITE_SECTIONS.find((s) => s.key === entry?.lastSite);
  const data = site ? entry[site.key] : null;

  const videos = data?.videosSeen?.length ?? 0;
  const articles = data?.articlesSeen?.length ?? 0;
  const minutes = Math.round((data?.activeMs ?? 0) / 60000);
  const intent = data?.intention;
  const goal =
    intent && intent.reason !== "skipped"
      ? intent.note
        ? `${intent.label}: "${intent.note}"`
        : intent.label
      : null;

  const stats = [];
  if (videos) stats.push(`${videos} ${videos === 1 ? "video" : "videos"}`);
  if (articles) stats.push(`${articles} ${articles === 1 ? "article" : "articles"}`);
  stats.push(formatDuration(minutes));

  sessionSection.hidden = !goal && !videos && !articles && !minutes;
  if (site) sessionTitle.textContent = `This session on ${site.name}`;
  sessionGoal.textContent = goal ? `Goal: ${goal}` : "No goal set";
  sessionStats.textContent = stats.join(" · ");
}

function formatDuration(minutes) {
  if (minutes < 1) return "under a minute";
  if (minutes < 60) return `${minutes} min`;
  const rest = minutes % 60;
  return `${Math.floor(minutes / 60)} hr${rest ? ` ${rest} min` : ""}`;
}

// --- Saving ---

async function update() {
  await saveSettings(settings);
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

// --- Startup ---
// The site sections are built first so the listeners below can find their inputs.

buildAppearanceControls();
buildSiteSections();
for (const [id, site] of Object.entries(BLOCKABLE_SITES)) {
  siteList.append(siteOption({ id, ...site }, false));
}

// --- Event listeners ---

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
  toggle.addEventListener("click", () => toggleSection(toggle.closest("[data-section]").dataset.section));
});

siteBlockInput.addEventListener("change", () => {
  settings.siteBlock.enabled = siteBlockInput.checked;
  update();
  if (settings.siteBlock.enabled) requestSiteAccess(chosenSites(settings));
});

siteList.addEventListener("change", (e) => {
  const id = e.target.dataset.site;
  if (!id) return;
  const excluded = settings.siteBlock.excluded.filter((x) => x !== id);
  if (!e.target.checked) excluded.push(id);
  settings.siteBlock.excluded = excluded;
  update();
  if (e.target.checked) requestSiteAccess(allSites(settings).filter((site) => site.id === id));
});

addSiteForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const domain = normalizeDomain(addSiteInput.value);
  const existing = domain && siteForHost(allSites(settings), domain);
  if (!domain) return showAddSiteError("That doesn't look like a website address.");
  if (existing) return showAddSiteError(`${existing.label} is already on the list.`);
  if (settings.siteBlock.custom.length >= MAX_CUSTOM_SITES) {
    return showAddSiteError(`You can add up to ${MAX_CUSTOM_SITES} sites.`);
  }

  settings.siteBlock.custom = [...settings.siteBlock.custom, domain];
  addSiteInput.value = "";
  addSiteError.hidden = true;
  update();
  requestSiteAccess([customSite(domain)]);
});

addSiteInput.addEventListener("input", () => {
  addSiteError.hidden = true;
});

document.getElementById("allow-access").addEventListener("click", () => {
  requestSiteAccess(chosenSites(settings));
});

chrome.permissions.onAdded.addListener(() => settings && renderSiteAccess());
chrome.permissions.onRemoved.addListener(() => settings && renderSiteAccess());

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.savedTangents) renderSavedTangents(changes.savedTangents.newValue);
  if (changes.discordStudyChannels) renderStudyChannels(changes.discordStudyChannels.newValue);
});

fontSelect.addEventListener("change", () => {
  settings.appearance.font = fontSelect.value;
  update();
});

document.getElementById("reset-appearance").addEventListener("click", () => {
  settings.appearance = { ...DEFAULT_SETTINGS.appearance };
  update();
});

document.getElementById("open-settings").addEventListener("click", () => showView(settingsView));
document.getElementById("close-settings").addEventListener("click", () => showView(mainView));

prefersDark.addEventListener("change", () => settings && renderAppearance());

Promise.all([
  loadSettings(),
  chrome.storage.local.get(["openSections", "savedTangents", "discordStudyChannels"])
]).then(([loaded, local]) => {
  settings = loaded;
  openSections = local.openSections ?? [];
  render();
  renderSections();
  renderSavedTangents(local.savedTangents);
  renderStudyChannels(local.discordStudyChannels);
});
renderSession();
