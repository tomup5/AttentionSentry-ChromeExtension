importScripts("shared/settings.js", "shared/common.js", "shared/sites.js");

const BLOCKED_PAGE = chrome.runtime.getURL("blocked/blocked.html");
const REDIRECT_RULE_ID = 1;
const BLOCK_RULE_ID = 2;
const UNLOCK_ALARM_PREFIX = "unlock:";

// Content scripts can read chrome.storage.session only once it's opened to them.
const sessionAccess = chrome.storage.session.setAccessLevel({
  accessLevel: "TRUSTED_AND_UNTRUSTED_CONTEXTS"
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!sender.tab) return;

  // Content scripts can't close their own tab.
  if (message.type === MESSAGES.CLOSE_TAB) {
    chrome.tabs.remove(sender.tab.id);
  }

  // Content scripts don't know their tab ID, which keys per-tab session state.
  if (message.type === MESSAGES.GET_TAB_ID) {
    sessionAccess.then(() => sendResponse(sender.tab.id));
    return true; // keep the channel open for the async response
  }

  // Sent by the blocked page's "Open anyway" / "Open for 5 minutes" button.
  // Only that page may unlock, not the content scripts running inside other sites.
  if (message.type === MESSAGES.UNLOCK_SITE && sender.url?.startsWith(BLOCKED_PAGE)) {
    unlockSite(message.siteId).then(sendResponse);
    return true;
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.session.remove(tabSessionKey(tabId));
});

// --- Site blocking ---
// Blocking uses declarativeNetRequest rules, so Chrome stops the page loading
// and the extension never reads the blocked sites' content.

// Unlocks are kept in session storage, so a browser restart re-blocks everything.
async function getUnlocks() {
  const stored = await chrome.storage.session.get(STORAGE_KEYS.UNLOCKS);
  return stored[STORAGE_KEYS.UNLOCKS] ?? {};
}

function saveUnlocks(unlocks) {
  return chrome.storage.session.set({ [STORAGE_KEYS.UNLOCKS]: unlocks });
}

async function unlockSite(siteId) {
  const settings = await loadSettings();
  if (settings.mode === "block") return false;

  const when = Date.now() + UNLOCK_MINUTES * MS_PER_MINUTE;
  await saveUnlocks({ ...(await getUnlocks()), [siteId]: when });
  chrome.alarms.create(`${UNLOCK_ALARM_PREFIX}${siteId}`, { when });
  await queueSync();
  return true;
}

async function syncBlockRules() {
  const settings = await loadSettings();
  const unlocks = await getUnlocks();
  const now = Date.now();
  const sites = isBlockingOn(settings)
    ? chosenSites(settings).filter((site) => !(unlocks[site.id] > now))
    : [];
  const domains = sites.flatMap((site) => site.domains);

  // Redirecting to our page needs host access to the site. Domains the user
  // didn't grant access to are still blocked, with Chrome's own error page.
  const access = await Promise.all(
    domains.map((domain) => chrome.permissions.contains({ origins: [originPattern(domain)] }))
  );
  const redirectDomains = domains.filter((_, i) => access[i]);
  const blockDomains = domains.filter((_, i) => !access[i]);

  const addRules = [];
  if (redirectDomains.length) {
    addRules.push({
      id: REDIRECT_RULE_ID,
      priority: 1,
      // \0 is the whole matched URL, passed to the blocked page so it can send the user on later.
      action: { type: "redirect", redirect: { regexSubstitution: `${BLOCKED_PAGE}#\\0` } },
      condition: {
        regexFilter: "^.+$",
        requestDomains: redirectDomains,
        resourceTypes: ["main_frame"]
      }
    });
  }
  if (blockDomains.length) {
    addRules.push({
      id: BLOCK_RULE_ID,
      priority: 1,
      action: { type: "block" },
      condition: { requestDomains: blockDomains, resourceTypes: ["main_frame"] }
    });
  }

  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: existing.map((rule) => rule.id),
    addRules
  });

  // Rules only catch new page loads, so send tabs already open on a blocked site there too.
  if (redirectDomains.length) {
    const tabs = await chrome.tabs.query({ url: redirectDomains.map(originPattern) });
    for (const tab of tabs) {
      chrome.tabs.update(tab.id, { url: `${BLOCKED_PAGE}#${tab.url}` });
    }
  }
}

// Run syncs one at a time; overlapping ones would both try to add the same rule IDs.
let syncing = Promise.resolve();
function queueSync() {
  syncing = syncing.then(syncBlockRules).catch((error) => console.error(error));
  return syncing;
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (!alarm.name.startsWith(UNLOCK_ALARM_PREFIX)) return;
  const siteId = alarm.name.slice(UNLOCK_ALARM_PREFIX.length);
  const unlocks = await getUnlocks();
  delete unlocks[siteId];
  await saveUnlocks(unlocks);
  queueSync();
});

chrome.storage.onChanged.addListener((changes) => {
  if (changes.settings) queueSync();
});
chrome.permissions.onAdded.addListener(queueSync);
chrome.permissions.onRemoved.addListener(queueSync);
chrome.runtime.onStartup.addListener(queueSync);
chrome.runtime.onInstalled.addListener(queueSync);
