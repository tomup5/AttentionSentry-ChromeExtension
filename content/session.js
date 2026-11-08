// Per-tab state that survives reloads but ends with the tab: one study session.
// Kept in chrome.storage.session rather than the page's sessionStorage, which
// the site's own scripts could read. Reads are served from an in-memory copy.
// Each site gets its own slot in the tab's entry, so a goal set on YouTube
// doesn't follow you to Reddit. `lastSite` tells the popup which slot to show.
const session = {
  storageKey: null,
  all: {},
  data: {},

  async load(site) {
    const tabId = await chrome.runtime.sendMessage({ type: "getTabId" });
    this.storageKey = tabSessionKey(tabId);
    const stored = await chrome.storage.session.get(this.storageKey);
    this.all = stored[this.storageKey] ?? {};
    this.data = this.all[site] ?? {};
    this.all[site] = this.data;
    this.all.lastSite = site;
    this.save();
  },
  get(key, fallback) {
    return key in this.data ? this.data[key] : fallback;
  },
  set(key, value) {
    this.data[key] = value;
    this.save();
  },
  // Adds `value` to the list at `key`. Returns the list's new length, or null if already there.
  addToSet(key, value) {
    const seen = this.get(key, []);
    if (seen.includes(value)) return null;
    seen.push(value);
    this.set(key, seen);
    return seen.length;
  },
  save() {
    // After the extension is reloaded or updated, scripts left in open tabs lose
    // access to chrome.* and the call below would throw instead of rejecting.
    if (!chrome.runtime?.id) return;
    chrome.storage.session.set({ [this.storageKey]: this.all }).catch(() => {
      // Quota or context errors only cost persistence across reloads.
    });
  }
};
