// The popup and the blocked page, loaded from their real HTML and script tags.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { activeSettings, createChrome, flush, loadPage } = require("./helpers/harness");

async function popup(t, chromeOptions) {
  const chrome = createChrome(chromeOptions);
  const page = loadPage("popup/popup.html", { chrome });
  t.after(page.close);
  await flush();
  return page;
}

const storedSettings = (page) => page.chrome.storage.sync.data.settings;

function change(page, input, value) {
  if (input.type === "checkbox") input.checked = value;
  else input.value = value;
  input.dispatchEvent(new page.window.Event("change", { bubbles: true }));
}

const setting = (page, name) => page.document.querySelector(`[data-setting="${name}"]`);

test("the popup builds a section for each site and the blocker", async (t) => {
  const { document } = await popup(t);
  const keys = [...document.querySelectorAll("[data-section]")].map((s) => s.dataset.section);
  assert.deepEqual(keys, ["youtube", "reddit", "wikipedia", "discord", "nyt", "siteBlock"]);
});

test("choosing a strictness level saves it", async (t) => {
  const page = await popup(t);
  page.document.querySelector('[data-mode="block"]').click();
  await flush();
  assert.equal(storedSettings(page).mode, "block");
});

test("a feature switch saves to its site's settings", async (t) => {
  const page = await popup(t);
  change(page, setting(page, "reddit.hideSidebars"), false);
  await flush();
  assert.equal(storedSettings(page).reddit.hideSidebars, false);
});

test("number settings are held to their allowed range", async (t) => {
  const page = await popup(t);
  change(page, setting(page, "wikipedia.hopLimit"), "999");
  await flush();
  assert.equal(storedSettings(page).wikipedia.hopLimit, 50);
});

test("a failed save shows an error and restores the stored settings", async (t) => {
  const chromeOptions = { sync: { settings: activeSettings({ mode: "pause" }) } };
  const chrome = createChrome(chromeOptions);
  chrome.storage.sync.set = async () => {
    throw new Error("quota exceeded");
  };
  const page = loadPage("popup/popup.html", { chrome });
  t.after(page.close);
  await flush();

  page.document.querySelector('[data-mode="block"]').click();
  await flush();
  assert.equal(page.document.getElementById("save-error").hidden, false);
  assert.equal(page.document.getElementById("status-text").textContent, "On · Pause");
});

test("moving a section down swaps it with the next one", async (t) => {
  const page = await popup(t);
  page.document.querySelector('[data-section="youtube"] [data-dir="1"]').click();
  await flush();
  assert.deepEqual(storedSettings(page).sectionOrder.slice(0, 2), ["reddit", "youtube"]);
});

test("adding a custom site rejects text that isn't an address", async (t) => {
  const page = await popup(t);
  page.document.getElementById("add-site-input").value = "not a site";
  page.document
    .getElementById("add-site")
    .dispatchEvent(new page.window.Event("submit", { cancelable: true }));
  await flush();
  assert.equal(page.document.getElementById("add-site-error").hidden, false);
});

test("the session card summarizes the active tab", async (t) => {
  const chrome = createChrome({
    session: {
      "tab-3": {
        lastSite: "youtube",
        youtube: {
          intention: { reason: "lecture", label: "Lecture", note: "integrals" },
          videosSeen: ["a", "b"],
          activeMs: 90 * 60000
        }
      }
    }
  });
  chrome.tabs.query = async () => [{ id: 3 }];
  const page = loadPage("popup/popup.html", { chrome });
  t.after(page.close);
  await flush();
  assert.equal(
    page.document.getElementById("session-goal").textContent,
    'Goal: Lecture: "integrals"'
  );
  assert.equal(page.document.getElementById("session-stats").textContent, "2 videos · 1 hr 30 min");
});

async function blocked(t, mode, hash = "https://www.tiktok.com/@someone") {
  const settings = activeSettings({ mode, siteBlock: { enabled: true } });
  const page = loadPage("blocked/blocked.html", {
    url: `https://extension.test/blocked/blocked.html#${hash}`,
    chrome: createChrome({ sync: { settings } })
  });
  t.after(page.close);
  await flush();
  return page;
}

const buttonLabels = (page) =>
  [...page.document.querySelectorAll(".sm-btn")].map((b) => b.textContent);

test("the blocked page names the site and offers a way through in Hint mode", async (t) => {
  const page = await blocked(t, "hint");
  assert.match(page.document.querySelector("h2").textContent, /^TikTok is blocked/);
  assert.deepEqual(buttonLabels(page), ["Open anyway", "Back to studying"]);
});

test("the blocked page makes you wait in Pause mode", async (t) => {
  const page = await blocked(t, "pause");
  assert.deepEqual(buttonLabels(page), ["Open for 5 minutes (15)", "Back to studying"]);
});

test("the blocked page offers no way through in Block mode", async (t) => {
  const page = await blocked(t, "block");
  assert.deepEqual(buttonLabels(page), ["Back to studying"]);
});

test("the blocked page never offers to open a non-web URL", async (t) => {
  const page = await blocked(t, "hint", "javascript:alert(1)");
  assert.equal(page.document.querySelector(".sm-url"), null);
  assert.deepEqual(buttonLabels(page), ["Back to studying"]);
});
