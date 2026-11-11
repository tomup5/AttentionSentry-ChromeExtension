const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createChrome, flush, loadWorker, plain } = require("./helpers/harness");

const BLOCKED_PAGE = "chrome-extension://test-extension/blocked/blocked.html";
const ALL_BUT_TIKTOK_AND_X = [
  "instagram",
  "snapchat",
  "facebook",
  "tumblr",
  "twitch",
  "netflix",
  "pinterest"
];

function blockingSettings(overrides = {}) {
  return {
    studyMode: true,
    mode: "hint",
    siteBlock: { enabled: true, excluded: ALL_BUT_TIKTOK_AND_X, custom: [] },
    ...overrides
  };
}

async function worker({ settings = blockingSettings(), granted = [] } = {}) {
  const chrome = createChrome({ sync: { settings }, granted });
  const loaded = await loadWorker({ chrome });
  chrome.runtime.onInstalled.fire();
  await flush();
  return loaded;
}

function send(chrome, message, sender) {
  return new Promise((resolve) => {
    const [keepOpen] = chrome.runtime.onMessage.fire(message, sender, resolve);
    if (!keepOpen) resolve(undefined);
  });
}

const ruleFor = (chrome, type) => plain(chrome.rules).find((r) => r.action.type === type);

test("sites with host access redirect; the rest get Chrome's block page", async () => {
  const { chrome } = await worker({ granted: ["*://*.tiktok.com/*"] });
  assert.deepEqual(ruleFor(chrome, "redirect").condition.requestDomains, ["tiktok.com"]);
  assert.deepEqual(ruleFor(chrome, "block").condition.requestDomains, ["x.com", "twitter.com"]);
});

test("the redirect passes the original URL to the blocked page", async () => {
  const { chrome } = await worker({ granted: ["*://*.tiktok.com/*"] });
  assert.equal(
    ruleFor(chrome, "redirect").action.redirect.regexSubstitution,
    `${BLOCKED_PAGE}#\\0`
  );
});

test("no rules exist while Attention Sentry is off", async () => {
  const { chrome } = await worker({ settings: blockingSettings({ studyMode: false }) });
  assert.deepEqual(plain(chrome.rules), []);
});

test("re-syncing replaces rules instead of adding duplicates", async () => {
  const { chrome } = await worker({ granted: ["*://*.tiktok.com/*"] });
  chrome.runtime.onStartup.fire();
  await flush();
  assert.equal(chrome.rules.length, 2);
});

test("the blocked page can unlock a site", async () => {
  const { chrome } = await worker();
  const sender = { tab: { id: 1 }, frameId: 0, url: `${BLOCKED_PAGE}#https://x.com/` };
  assert.equal(await send(chrome, { type: "unlockSite", siteId: "x" }, sender), true);
  await flush();
  assert.deepEqual(ruleFor(chrome, "block").condition.requestDomains, ["tiktok.com"]);
});

test("a content script on another site cannot unlock anything", async () => {
  const { chrome } = await worker();
  const sender = { tab: { id: 1 }, url: "https://evil.example/" };
  assert.equal(await send(chrome, { type: "unlockSite", siteId: "x" }, sender), undefined);
  assert.equal(chrome.storage.session.data.unlocks, undefined);
});

test("Block mode refuses to unlock", async () => {
  const { chrome } = await worker({ settings: blockingSettings({ mode: "block" }) });
  const sender = { tab: { id: 1 }, frameId: 0, url: BLOCKED_PAGE };
  assert.equal(await send(chrome, { type: "unlockSite", siteId: "x" }, sender), false);
});

test("session storage stays closed to content scripts", async () => {
  const { chrome } = await worker();
  assert.equal(chrome.storage.session.accessLevel, "TRUSTED_CONTEXTS");
});

test("a content script saves and loads its own tab's session state", async () => {
  const { chrome } = await worker();
  const sender = { tab: { id: 42 }, frameId: 0, url: "https://www.reddit.com/" };
  const data = { lastSite: "reddit", reddit: { goal: "integrals" } };
  assert.equal(await send(chrome, { type: "saveSession", data }, sender), true);
  assert.deepEqual(plain(chrome.storage.session.data["tab-42"]), data);
  assert.deepEqual(plain(await send(chrome, { type: "loadSession" }, sender)), data);
});

test("a content script can't reach another tab's session state or the unlocks", async () => {
  const chrome = createChrome({
    sync: { settings: blockingSettings() },
    session: { "tab-1": { lastSite: "nyt" }, unlocks: { x: Date.now() + 60000 } }
  });
  await loadWorker({ chrome });
  const sender = { tab: { id: 2 }, frameId: 0, url: "https://www.reddit.com/" };
  assert.deepEqual(plain(await send(chrome, { type: "loadSession" }, sender)), {});
  await send(chrome, { type: "saveSession", data: { unlocks: {} } }, sender);
  assert.deepEqual(plain(chrome.storage.session.data["tab-1"]), { lastSite: "nyt" });
  assert.ok(chrome.storage.session.data.unlocks.x);
});

test("a top-level page can close its own tab", async () => {
  const { chrome } = await worker();
  await send(chrome, { type: "closeTab" }, { tab: { id: 5 }, frameId: 0, url: BLOCKED_PAGE });
  assert.deepEqual(chrome.removedTabs, [5]);
});

test("the blocked page can't close the tab when another site frames it", async () => {
  const { chrome } = await worker();
  await send(chrome, { type: "closeTab" }, { tab: { id: 5 }, frameId: 3, url: BLOCKED_PAGE });
  assert.deepEqual(chrome.removedTabs, []);
});

test("closing a tab clears its session state", async () => {
  const chrome = createChrome({ session: { "tab-9": { lastSite: "nyt" } } });
  await loadWorker({ chrome });
  chrome.tabs.onRemoved.fire(9);
  await flush();
  assert.equal(chrome.storage.session.data["tab-9"], undefined);
});

test("the blocked page cannot unlock from inside another site's frame", async () => {
  const { chrome } = await worker();
  const sender = { tab: { id: 1 }, frameId: 4, url: BLOCKED_PAGE };
  assert.equal(await send(chrome, { type: "unlockSite", siteId: "x" }, sender), undefined);
  assert.equal(chrome.storage.session.data.unlocks, undefined);
});

test("unlocking a site that isn't on the block list is refused", async () => {
  const { chrome } = await worker();
  const sender = { tab: { id: 1 }, frameId: 0, url: BLOCKED_PAGE };
  assert.equal(await send(chrome, { type: "unlockSite", siteId: "not-a-site" }, sender), false);
  assert.equal(chrome.storage.session.data.unlocks, undefined);
});
