// Per-tab state for one study session. Survives reloads, ends with the tab.
// Kept in chrome.storage.session because the site's own scripts can read sessionStorage.
// That area is extension-only, so reads and writes go through the background worker,
// which files them under this tab.
// Each site gets its own slot so a goal set on YouTube doesn't follow you to Reddit.
// lastSite tells the popup which slot to show.
const session = {
  all: {},
  data: {},

  async load(site) {
    this.all = (await chrome.runtime.sendMessage({ type: MESSAGES.LOAD_SESSION })) ?? {};
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
    chrome.runtime.sendMessage({ type: MESSAGES.SAVE_SESSION, data: this.all }).catch(() => {
      // Not worth surfacing, worst case the state doesn't survive a reload
    });
  }
};
