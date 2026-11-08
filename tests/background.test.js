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
  const sender = { tab: { id: 1 }, url: `${BLOCKED_PAGE}#https://x.com/` };
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
  const sender = { tab: { id: 1 }, url: BLOCKED_PAGE };
  assert.equal(await send(chrome, { type: "unlockSite", siteId: "x" }, sender), false);
});

test("a content script is told its own tab ID", async () => {
  const { chrome } = await worker();
  assert.equal(await send(chrome, { type: "getTabId" }, { tab: { id: 42 } }), 42);
});

test("closing a tab clears its session state", async () => {
  const chrome = createChrome({ session: { "tab-9": { lastSite: "nyt" } } });
  await loadWorker({ chrome });
  chrome.tabs.onRemoved.fire(9);
  await flush();
  assert.equal(chrome.storage.session.data["tab-9"], undefined);
});
