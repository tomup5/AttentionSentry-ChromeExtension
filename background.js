importScripts("shared/settings.js", "shared/common.js", "shared/sites.js");

const BLOCKED_PAGE = chrome.runtime.getURL("blocked/blocked.html");
const REDIRECT_RULE_ID = 1;
const BLOCK_RULE_ID = 2;
const UNLOCK_ALARM_PREFIX = "unlock:";

// storage.session is extension-only by default, content scripts need this to read it
const sessionAccess = chrome.storage.session.setAccessLevel({
  accessLevel: "TRUSTED_AND_UNTRUSTED_CONTEXTS"
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!sender.tab) return;

  if (message.type === MESSAGES.CLOSE_TAB) {
    chrome.tabs.remove(sender.tab.id);
  }

  // Content scripts have no way to get their own tab id
  if (message.type === MESSAGES.GET_TAB_ID) {
    sessionAccess.then(() => sendResponse(sender.tab.id));
    return true; // keep the channel open for the async response
  }

  // Has to come from the blocked page itself, otherwise any content script could unlock
  // sites. Top frame only, since other sites are allowed to load that page in an iframe.
  if (
    message.type === MESSAGES.UNLOCK_SITE &&
    sender.frameId === 0 &&
    sender.url?.startsWith(BLOCKED_PAGE)
  ) {
    unlockSite(message.siteId).then(sendResponse);
    return true;
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.session.remove(tabSessionKey(tabId));
});

// DNR rules mean Chrome does the blocking and we never touch the page

// In session storage so restarting the browser re-blocks everything
async function getUnlocks() {
  const stored = await chrome.storage.session.get(STORAGE_KEYS.UNLOCKS);
  return stored[STORAGE_KEYS.UNLOCKS] ?? {};
}

function saveUnlocks(unlocks) {
  return chrome.storage.session.set({ [STORAGE_KEYS.UNLOCKS]: unlocks });
}

async function unlockSite(siteId) {
  const settings = await loadSettings();
  if (settings.mode === "block" || !chosenSites(settings).some((s) => s.id === siteId)) {
    return false;
  }

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

  // Redirecting needs host access. Without it the site still gets blocked, just with
  // Chrome's error page.
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
      // \0 is the full matched URL, the blocked page needs it to send you on later
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

  // Rules only apply to new loads, tabs already on the site need redirecting by hand
  if (redirectDomains.length) {
    const tabs = await chrome.tabs.query({ url: redirectDomains.map(originPattern) });
    for (const tab of tabs) {
      chrome.tabs.update(tab.id, { url: `${BLOCKED_PAGE}#${tab.url}` });
    }
  }
}

// One at a time, overlapping syncs would try to add the same rule IDs
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
