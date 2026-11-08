const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createChrome, loadScripts, plain } = require("./helpers/harness");

const SHARED = [
  "shared/settings.js",
  "shared/common.js",
  "shared/appearance.js",
  "shared/sites.js"
];

function shared(t, options) {
  const page = loadScripts(SHARED, options);
  t.after(page.close);
  return page;
}

test("mergeSettings fills keys missing from older saved settings", (t) => {
  const { window } = shared(t);
  const merged = plain(window.mergeSettings({ youtube: { hideMetrics: false } }));
  assert.equal(merged.youtube.hideMetrics, false);
  assert.equal(merged.youtube.scrollScreens, 10);
  assert.equal(merged.nyt.articleLimit, 3);
});

test("mergeSettings keeps saved arrays instead of merging them", (t) => {
  const { window } = shared(t);
  const merged = plain(window.mergeSettings({ sectionOrder: ["nyt"] }));
  assert.deepEqual(merged.sectionOrder, ["nyt"]);
});

test("persistSettings returns the draft when the save succeeds", async (t) => {
  const { window } = shared(t);
  const draft = window.mergeSettings({ mode: "block" });
  const result = await window.persistSettings(draft);
  assert.equal(result.settings.mode, "block");
  assert.equal(result.error, null);
});

test("persistSettings falls back to what is stored when the save fails", async (t) => {
  const chrome = createChrome({ sync: { settings: { mode: "pause" } } });
  chrome.storage.sync.set = async () => {
    throw new Error("QUOTA_BYTES_PER_ITEM quota exceeded");
  };
  const { window } = shared(t, { chrome });
  const result = await window.persistSettings(window.mergeSettings({ mode: "block" }));
  assert.equal(result.settings.mode, "pause");
  assert.match(result.error.message, /quota/);
});

test("formatIntention includes the note when there is one", (t) => {
  const { window } = shared(t);
  assert.equal(
    window.formatIntention({ reason: "lecture", label: "Lecture", note: "integrals" }),
    'Lecture: "integrals"'
  );
  assert.equal(
    window.formatIntention({ reason: "lecture", label: "Lecture", note: "" }),
    "Lecture"
  );
});

test("formatIntention treats a skipped or missing intention as no goal", (t) => {
  const { window } = shared(t);
  assert.equal(window.formatIntention({ reason: "skipped", label: "No reason given" }), null);
  assert.equal(window.formatIntention(null), null);
});

test("el sets user text as text, never as markup", (t) => {
  const { window, document } = shared(t);
  const node = window.el("p", { text: "<img src=x onerror=alert(1)>" });
  assert.equal(node.querySelector("img"), null);
  assert.equal(node.textContent, "<img src=x onerror=alert(1)>");
  assert.equal(document.querySelector("img"), null);
});

test("el skips empty children and attaches listeners", (t) => {
  const { window } = shared(t);
  let clicks = 0;
  const node = window.el("button", { class: "a", onclick: () => clicks++ }, null, "Go");
  node.click();
  assert.equal(node.className, "a");
  assert.equal(node.textContent, "Go");
  assert.equal(clicks, 1);
});

for (const [input, expected] of [
  ["https://www.Reddit.com/r/all", "reddit.com"],
  ["  news.ycombinator.com ", "news.ycombinator.com"],
  ["example.co.uk/path?q=1", "example.co.uk"],
  ["not a site", null],
  ["localhost", null],
  ["", null]
]) {
  test(`normalizeDomain(${JSON.stringify(input)}) is ${expected}`, (t) => {
    assert.equal(shared(t).window.normalizeDomain(input), expected);
  });
}

test("siteForHost matches subdomains but not lookalike domains", (t) => {
  const { window } = shared(t);
  const sites = [{ id: "x", domains: ["x.com"] }];
  assert.equal(window.siteForHost(sites, "mobile.x.com").id, "x");
  assert.equal(window.siteForHost(sites, "netflix.com"), undefined);
});

test("chosenSites leaves out unchecked sites and includes custom ones", (t) => {
  const { window } = shared(t);
  const settings = window.mergeSettings({
    siteBlock: { excluded: ["tiktok"], custom: ["example.com"] }
  });
  const ids = plain(window.chosenSites(settings)).map((site) => site.id);
  assert.ok(!ids.includes("tiktok"));
  assert.ok(ids.includes("instagram"));
  assert.ok(ids.includes("custom:example.com"));
});

test("isBlockingOn needs both the main switch and the blocker switch", (t) => {
  const { window } = shared(t);
  const on = (studyMode, enabled) =>
    window.isBlockingOn(window.mergeSettings({ studyMode, siteBlock: { enabled } }));
  assert.equal(on(true, true), true);
  assert.equal(on(true, false), false);
  assert.equal(on(false, true), false);
});

test("resolveTheme follows the host for auto and for unknown themes", (t) => {
  const { window } = shared(t);
  assert.equal(window.resolveTheme("auto", true).label, "Dark");
  assert.equal(window.resolveTheme("auto", false).label, "White");
  assert.equal(window.resolveTheme("removed-theme", false).label, "White");
  assert.equal(window.resolveTheme("sage", true).label, "Sage");
});

test("resolvePalette picks the accent shade that suits the background", (t) => {
  const { window } = shared(t);
  const palette = (background, accent) => window.resolvePalette({ background, accent }, false);
  assert.equal(palette("dark", "rose").accent, "#e49aac");
  assert.equal(palette("light", "rose").accent, "#a8334f");
  assert.equal(palette("sage", "theme").accent, "#40693f");
});

test("theme variables survive the host page rewriting <html style>", (t) => {
  const { window, document } = shared(t);
  const { appearance } = window.mergeSettings({});
  window.applyAppearance(document, { ...appearance, textSize: "large" }, false, "sm-");
  document.documentElement.setAttribute("style", "font-size: 100%");

  const css = document.getElementById("sm-theme").textContent;
  assert.match(css, /--sm-scale: 1\.15;/);
  assert.match(css, /--sm-bg: #e2702e;/);
});

test("applying the theme twice leaves one stylesheet of each kind", (t) => {
  const { window, document } = shared(t);
  const { appearance } = window.mergeSettings({});
  window.applyAppearance(document, appearance, false, "sm-");
  window.applyAppearance(document, appearance, false, "sm-");
  assert.equal(document.querySelectorAll("#sm-theme").length, 1);
  assert.equal(document.querySelectorAll("#sm-font-faces").length, 1);
});
