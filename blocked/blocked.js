// Shown instead of a blocked site. The original URL comes in through the hash.

const UNLOCK_COUNTDOWN = 15; // seconds, Pause mode only

const BODY = {
  hint: `You can still open it for ${UNLOCK_MINUTES} minutes if you really need to.`,
  pause: `Still need it after a quick wait? You get ${UNLOCK_MINUTES} minutes.`,
  block: "It comes back when you turn Attention Sentry off."
};

const blockedUrl = parseBlockedUrl(location.hash.slice(1));
const prefersDark = matchMedia("(prefers-color-scheme: dark)");

/** @type {Settings} */
let settings;

// Any site can open this page with whatever hash it wants, so only allow http(s)
function parseBlockedUrl(raw) {
  try {
    const url = new URL(raw);
    return /^https?:$/.test(url.protocol) ? url : null;
  } catch {
    return null;
  }
}

async function isUnlocked(site) {
  const stored = await chrome.storage.session.get(STORAGE_KEYS.UNLOCKS);
  return stored[STORAGE_KEYS.UNLOCKS]?.[site.id] > Date.now();
}

function applyTheme() {
  applyAppearance(document, settings.appearance, prefersDark.matches, "sm-");
}

async function render() {
  applyTheme();

  const site = blockedUrl && siteForHost(chosenSites(settings), blockedUrl.hostname);

  // Any site can link here, so without this the page would work as an open redirect
  if (blockedUrl && !siteForHost(allSites(settings), blockedUrl.hostname)) {
    showNotListed();
    return;
  }

  // Blocking got turned off or the site got unlocked (could be from another tab)
  if (blockedUrl && (!site || !isBlockingOn(settings) || (await isUnlocked(site)))) {
    location.replace(blockedUrl.href);
    return;
  }

  const label = site?.label ?? "This site";
  document.title = `${label} blocked · Attention Sentry`;

  closeOverlay();
  showOverlay({
    title: `Nope, ${site?.label ?? "this site"} doesn't get your study time`,
    body: BODY[settings.mode],
    content: blockedUrl ? el("p", { class: "sm-url", text: blockedUrl.href }) : null,
    buttons: buttons(site),
    pauseVideos: false
  });
}

function showNotListed() {
  document.title = "Not blocked · Attention Sentry";
  closeOverlay();
  showOverlay({
    title: "This site isn't on your block list",
    body: "Only continue if you trust this address.",
    content: el("p", { class: "sm-url", text: blockedUrl.href }),
    buttons: [
      { label: "Continue to this site", onClick: () => location.replace(blockedUrl.href) },
      { label: "Back to studying", primary: true, onClick: leave }
    ],
    pauseVideos: false
  });
}

function buttons(site) {
  /** @type {OverlayButton[]} */
  const list = [{ label: "Back to studying", primary: true, onClick: leave }];
  if (site && settings.mode !== "block") {
    list.unshift({
      label: settings.mode === "hint" ? "Open anyway" : `Open for ${UNLOCK_MINUTES} minutes`,
      countdown: settings.mode === "pause" ? UNLOCK_COUNTDOWN : 0,
      onClick: () => unlock(site)
    });
  }
  return list;
}

function leave() {
  if (history.length > 1) history.back();
  else chrome.runtime.sendMessage({ type: MESSAGES.CLOSE_TAB });
}

async function unlock(site) {
  const unlocked = await chrome.runtime.sendMessage({
    type: MESSAGES.UNLOCK_SITE,
    siteId: site.id
  });
  if (unlocked) location.replace(blockedUrl.href);
}

chrome.storage.onChanged.addListener((changes) => {
  if (changes.settings) settings = mergeSettings(changes.settings.newValue);
  if (settings && (changes.settings || changes[STORAGE_KEYS.UNLOCKS])) render();
});

prefersDark.addEventListener("change", () => settings && applyTheme());

loadSettings().then((loaded) => {
  settings = loaded;
  render();
});
