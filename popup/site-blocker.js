// "Distracting sites" section

// matches what blocked/blocked.js does in each mode
const SITE_MODE_NOTES = {
  hint: "Blocked sites show a reminder with an Open anyway button.",
  pause: `Blocked sites can open for ${UNLOCK_MINUTES} minutes after a short wait.`,
  block: "Blocked sites stay closed until you turn Attention Sentry off."
};

// Keeps settings under the sync storage per-item limit
const MAX_CUSTOM_SITES = 50;

const siteBlockInput = document.getElementById("siteBlock");
const sitesCount = document.getElementById("sites-count");
const sitesDesc = document.getElementById("sites-desc");
const siteOptions = document.getElementById("site-options");
const siteList = document.getElementById("site-list");
const addSiteForm = document.getElementById("add-site");
const addSiteInput = document.getElementById("add-site-input");
const addSiteError = document.getElementById("add-site-error");
const siteAccess = document.getElementById("site-access");

function renderSites() {
  const { siteBlock } = settings;
  siteBlockInput.checked = siteBlock.enabled;
  siteOptions.classList.toggle("disabled", !siteBlock.enabled);
  sitesDesc.textContent = SITE_MODE_NOTES[settings.mode];
  sitesCount.textContent = siteBlock.enabled ? `${chosenSites(settings).length} blocked` : "Off";

  // Built-ins only get created once, custom ones get rebuilt
  siteList.querySelectorAll(".custom").forEach((node) => node.remove());
  siteBlock.custom.forEach((domain) => siteList.append(siteOption(customSite(domain), true)));
  for (const input of siteList.querySelectorAll("input")) {
    input.checked = !siteBlock.excluded.includes(input.dataset.site);
  }

  renderSiteAccess();
}

// Sites we don't have access to get Chrome's error page instead of ours
async function renderSiteAccess() {
  const origins = chosenSites(settings)
    .flatMap((site) => site.domains)
    .map(originPattern);
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

// Has to be called straight from a click handler, Chrome needs a user gesture for
// the prompt. The popup can close while it's open, so save settings before calling.
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

for (const [id, site] of Object.entries(BLOCKABLE_SITES)) {
  siteList.append(siteOption({ id, ...site }, false));
}

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
