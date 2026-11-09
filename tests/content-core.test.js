const { test } = require("node:test");
const assert = require("node:assert/strict");
const { activeSettings, flush, plain, startCoreSite } = require("./helpers/harness");

async function start(t, options) {
  const page = await startCoreSite(options);
  t.after(page.close);
  return page;
}

function counters() {
  const calls = { onUrlChange: 0, checkPage: 0, onActive: 0, onInactive: 0, applyClasses: 0 };
  const hooks = { navigationEvent: "test-navigate" };
  for (const name of Object.keys(calls)) hooks[name] = () => calls[name]++;
  return { calls, hooks };
}

function changeSettings(page, settings) {
  return page.chrome.storage.sync.set({ settings });
}

function navigate(page, path) {
  page.window.history.pushState({}, "", path);
  page.document.dispatchEvent(new page.window.Event("test-navigate"));
}

// Site lifecycle

test("startup treats the first page as a URL change and checks it", async (t) => {
  const { calls, hooks } = counters();
  await start(t, { hooks });
  assert.equal(calls.onUrlChange, 1);
  assert.equal(calls.checkPage, 1);
  assert.equal(calls.onActive, 1);
});

test("a settings change re-checks the page but is not a navigation", async (t) => {
  const { calls, hooks } = counters();
  const page = await start(t, { hooks });
  await changeSettings(page, activeSettings({ appearance: { accent: "rose" } }));
  assert.equal(calls.onUrlChange, 1, "per-page state such as a stopped feed must survive");
  assert.equal(calls.checkPage, 2);
});

test("a URL change runs the page hooks once", async (t) => {
  const { calls, hooks } = counters();
  const page = await start(t, { hooks, url: "https://www.reddit.com/" });
  navigate(page, "/r/learnmath");
  navigate(page, "/r/learnmath");
  assert.equal(calls.onUrlChange, 2);
  assert.equal(calls.checkPage, 2);
});

test("while off, a site clears its UI and skips the page check", async (t) => {
  const { calls, hooks } = counters();
  const page = await start(t, { hooks, settings: { studyMode: false } });
  page.window.showToast({ title: "Left over" });
  await changeSettings(page, { studyMode: false });
  assert.equal(calls.checkPage, 0);
  assert.equal(calls.onInactive, 2);
  assert.equal(page.document.querySelector(".sm-toast"), null);
});

test("a page restored from the back/forward cache counts as a new page", async (t) => {
  const { calls, hooks } = counters();
  const page = await start(t, { hooks });
  const event = new page.window.Event("pageshow");
  event.persisted = true;
  page.window.dispatchEvent(event);
  await flush();
  assert.equal(calls.onUrlChange, 2);
});

// Session

test("session state is kept per site within a tab", async (t) => {
  const page = await start(t);
  page.run(`session.set("goal", "integrals")`);
  await flush();
  const stored = plain(page.chrome.storage.session.data["tab-7"]);
  assert.equal(stored.reddit.goal, "integrals");
  assert.equal(stored.lastSite, "reddit");
});

test("session.addToSet counts distinct values and ignores repeats", async (t) => {
  const page = await start(t);
  assert.equal(page.run(`session.addToSet("seen", "a")`), 1);
  assert.equal(page.run(`session.addToSet("seen", "b")`), 2);
  assert.equal(page.run(`session.addToSet("seen", "a")`), null);
});

test("saving does nothing once the extension has been reloaded", async (t) => {
  const page = await start(t);
  delete page.chrome.runtime.id;
  page.chrome.storage.session.set = () => {
    throw new Error("Extension context invalidated.");
  };
  assert.doesNotThrow(() => page.run(`session.set("goal", "x")`));
});

// Page observer

test("createPageObserver starts once and stops when disabled", async (t) => {
  const page = await start(t);
  page.window.observed = { starts: 0, changes: 0 };
  page.run(`globalThis.setObserving = createPageObserver(() => observed.changes++, {
    onStart: () => observed.starts++
  })`);

  page.window.setObserving(true);
  page.window.setObserving(true);
  page.document.body.append(page.document.createElement("div"));
  await flush();
  assert.equal(page.window.observed.starts, 1);
  assert.equal(page.window.observed.changes, 1);

  page.window.setObserving(false);
  page.document.body.append(page.document.createElement("div"));
  await flush();
  assert.equal(page.window.observed.changes, 1);
});

// Endless-scroll nudge

async function feedPage(t, mode, scrollScreens = 10) {
  const settings = activeSettings({ mode, reddit: { scrollScreens } });
  const page = await start(t, { settings });
  page.window.stopped = false;
  page.run(`globalThis.nudge = createScrollNudge({
    siteName: "Reddit",
    isFeed: () => true,
    stopFeed: () => { stopped = true; }
  });
  nudge.reset();`);
  return page;
}

function scrollTo(page, screens) {
  Object.defineProperty(page.window, "scrollY", {
    configurable: true,
    value: screens * page.window.innerHeight
  });
  page.window.dispatchEvent(new page.window.Event("scroll"));
}

test("scrolling short of the limit doesn't nudge", async (t) => {
  const page = await feedPage(t, "hint");
  scrollTo(page, 9);
  assert.equal(page.document.querySelector(".sm-toast"), null);
});

test("Hint mode nudges with a toast at the limit", async (t) => {
  const page = await feedPage(t, "hint");
  scrollTo(page, 10);
  assert.match(page.document.querySelector(".sm-toast h4").textContent, /10 screens/);
});

test("Pause mode nudges with an overlay at the limit", async (t) => {
  const page = await feedPage(t, "pause");
  scrollTo(page, 10);
  assert.equal(page.window.isOverlayOpen(), true);
  assert.equal(page.window.stopped, false);
});

test("Block mode stops the feed at the limit", async (t) => {
  const page = await feedPage(t, "block");
  scrollTo(page, 10);
  assert.equal(page.window.stopped, true);
});

test("the next nudge comes one limit further down", async (t) => {
  const page = await feedPage(t, "hint");
  scrollTo(page, 10);
  scrollTo(page, 15);
  assert.equal(page.document.querySelectorAll(".sm-toast").length, 1);
  scrollTo(page, 20);
  assert.equal(page.document.querySelectorAll(".sm-toast").length, 2);
});

test("lowering the limit applies without a navigation", async (t) => {
  const page = await feedPage(t, "hint", 50);
  await changeSettings(page, activeSettings({ mode: "hint", reddit: { scrollScreens: 5 } }));
  scrollTo(page, 6);
  assert.equal(page.document.querySelectorAll(".sm-toast").length, 1);
});

// Check-ins

test("a count check-in is a toast in Hint mode", async (t) => {
  const page = await start(t, { settings: activeSettings({ mode: "hint" }) });
  page.run(`showCountCheckIn({ noun: "Video", count: 3, technique: TECHNIQUES.recommendations })`);
  assert.equal(
    page.document.querySelector(".sm-toast h4").textContent,
    "Video #3. Did you pick this one or did they?"
  );
});

test("a count check-in waits five seconds in Pause mode", async (t) => {
  const page = await start(t, { settings: activeSettings({ mode: "pause" }) });
  page.run(`showCountCheckIn({ noun: "Article", count: 4, technique: TECHNIQUES.articleChain })`);
  const continueButton = page.document.querySelector(".sm-primary");
  assert.equal(continueButton.textContent, "I picked it, it's for class (5)");
  page.window.closeOverlay();
});

test("a count check-in runs onContinue after closing in Block mode", async (t) => {
  const page = await start(t, { settings: activeSettings({ mode: "block" }) });
  page.window.continued = false;
  page.run(`showCountCheckIn({
    noun: "Video", count: 2, technique: TECHNIQUES.recommendations,
    onContinue: () => { continued = true; }
  })`);
  page.document.querySelector(".sm-primary").click();
  assert.equal(page.window.continued, true);
  assert.equal(page.window.isOverlayOpen(), false);
});

test("explainOnce shows its toast the first time only", async (t) => {
  const page = await start(t);
  const explain = () => page.window.explainOnce("flag", { title: "Hidden" });
  await explain();
  await explain();
  assert.equal(page.document.querySelectorAll(".sm-toast").length, 1);
  assert.equal(page.chrome.storage.local.data.flag, true);
});
