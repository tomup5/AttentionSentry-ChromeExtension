// Per-tab state for one study session. Survives reloads, ends with the tab.
// Using chrome.storage.session because the site's own scripts can read sessionStorage.
// Each site gets its own slot so a goal set on YouTube doesn't follow you to Reddit.
// lastSite tells the popup which slot to show.
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
  // Returns the new length, or null if value was already in the list
  addToSet(key, value) {
    const seen = this.get(key, []);
    if (seen.includes(value)) return null;
    seen.push(value);
    this.set(key, seen);
    return seen.length;
  },
  save() {
    // Extension got reloaded/updated and this tab is orphaned. chrome.* throws here
    // instead of rejecting, so the catch below wouldn't help.
    if (!chrome.runtime?.id) return;
    chrome.storage.session.set({ [this.storageKey]: this.all }).catch(() => {
      // Not worth surfacing, worst case the state doesn't survive a reload
    });
  }
};
