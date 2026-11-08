const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { ROOT, flush, loadSite, manifest, plain } = require("./helpers/harness");

async function site(t, name, url, options) {
  const page = await loadSite(name, { url, ...options });
  t.after(page.close);
  return page;
}

// Manifest

for (const entry of manifest.content_scripts) {
  test(`every file listed for ${entry.matches[0]} exists`, () => {
    for (const file of [...entry.js, ...entry.css]) {
      assert.ok(fs.existsSync(path.join(ROOT, file)), `${file} is missing`);
    }
  });
}

for (const [name, url] of [
  ["youtube", "https://www.youtube.com/"],
  ["reddit", "https://www.reddit.com/r/learnmath"],
  ["wikipedia", "https://en.wikipedia.org/wiki/Calculus"],
  ["discord", "https://discord.com/channels/1/2"],
  ["nyt", "https://www.nytimes.com/section/science"]
]) {
  test(`${name} starts cleanly from its manifest script list`, async (t) => {
    const errors = [];
    const page = await site(t, name, url);
    page.window.addEventListener("error", (event) => errors.push(event.message));
    await flush();
    assert.deepEqual(errors, []);
    assert.ok(page.run("settings"), "startSite should have loaded settings");
  });
}

// YouTube

for (const text of [
  "1.2M views",
  "No views",
  "1,024 subscribers",
  "3.4K watching",
  "12 videos",
  "1.2M views • 2 days ago"
]) {
  test(`YouTube treats "${text}" as a metric`, async (t) => {
    const page = await site(t, "youtube", "https://www.youtube.com/");
    assert.equal(page.window.isMetricText(text), true);
  });
}

for (const text of ["How views work in SQL", "2 days ago", "", "9 ".repeat(50) + "views"]) {
  test(`YouTube leaves "${text.slice(0, 24)}" alone`, async (t) => {
    const page = await site(t, "youtube", "https://www.youtube.com/");
    assert.equal(page.window.isMetricText(text), false);
  });
}

for (const [url, type] of [
  ["https://www.youtube.com/", "feed"],
  ["https://www.youtube.com/watch?v=abc", "watch"],
  ["https://www.youtube.com/shorts/abc", "shorts"],
  ["https://www.youtube.com/results?search_query=x", "feed"],
  ["https://www.youtube.com/@channel", "other"]
]) {
  test(`YouTube classifies ${url} as ${type}`, async (t) => {
    const page = await site(t, "youtube", url);
    assert.equal(page.window.pageType(), type);
  });
}

test("YouTube keeps a stopped feed when a setting changes", async (t) => {
  const page = await site(t, "youtube", "https://www.youtube.com/", {
    settings: { studyMode: true, mode: "block", youtube: { intention: false } },
    local: { metricsExplained: true }
  });
  page.run(`feedHasBottom = true; applyPageClasses();`);
  await page.chrome.storage.sync.set({
    settings: {
      studyMode: true,
      mode: "block",
      youtube: { intention: false },
      appearance: { accent: "rose" }
    }
  });
  assert.ok(page.document.documentElement.classList.contains("sm-feed-bottom"));
});

// Reddit

for (const [path_, type] of [
  ["/", "front"],
  ["/r/popular/", "front"],
  ["/r/all", "front"],
  ["/r/learnmath/", "listing"],
  ["/r/learnmath/top/", "listing"],
  ["/r/learnmath/comments/abc/title/", "post"],
  ["/settings", "other"]
]) {
  test(`Reddit classifies ${path_} as ${type}`, async (t) => {
    const page = await site(t, "reddit", `https://www.reddit.com${path_}`, {
      settings: { studyMode: false }
    });
    assert.equal(page.window.pageType(), type);
  });
}

// New York Times

for (const [path_, type] of [
  ["/", "home"],
  ["/international/", "home"],
  ["/games/wordle/index.html", "game"],
  ["/crosswords/game/mini", "game"],
  ["/2026/03/02/science/space.html", "article"],
  ["/live/2026/03/02/world/x", "article"],
  ["/section/science", "other"]
]) {
  test(`NYT classifies ${path_} as ${type}`, async (t) => {
    const page = await site(t, "nyt", `https://www.nytimes.com${path_}`, {
      settings: { studyMode: false }
    });
    assert.equal(page.window.pageType(), type);
  });
}

test("NYT names the game from the path", async (t) => {
  const page = await site(t, "nyt", "https://www.nytimes.com/games/wordle/index.html", {
    settings: { studyMode: false }
  });
  assert.equal(page.window.gameName(), "Wordle");
});

// Discord

test("Discord reads the server and channel from the URL", async (t) => {
  const page = await site(t, "discord", "https://discord.com/channels/123/456");
  assert.deepEqual(plain(page.window.currentChannel()), { guild: "123", channel: "456" });
});

test("Discord has no current channel on the friends list", async (t) => {
  const page = await site(t, "discord", "https://discord.com/channels/@me");
  assert.equal(page.window.currentChannel(), null);
});

test("Discord reads channel and server names from the tab title", async (t) => {
  const page = await site(t, "discord", "https://discord.com/channels/123/456");
  page.document.title = "Discord | #homework | Math 101";
  assert.deepEqual(plain(page.window.channelNames()), { name: "#homework", server: "Math 101" });
});

// Wikipedia

const WIKI = "https://en.wikipedia.org/wiki/Calculus";

function walk(window, hops) {
  let trail = window.advanceTrail([], { title: "Start", url: "/start" }, false).trail;
  let result;
  for (let i = 1; i <= hops; i++) {
    result = window.advanceTrail(trail, { title: `P${i}`, url: `/p${i}` }, true);
    trail = result.trail;
  }
  return result;
}

test("a Wikipedia trail keeps its first page when it is trimmed", async (t) => {
  const page = await site(t, "wikipedia", WIKI);
  const { trail } = walk(page.window, 80);
  assert.equal(trail.length, page.run("TRAIL_MAX"));
  assert.equal(trail[0].url, "/start");
  assert.equal(trail[trail.length - 1].url, "/p80");
});

test("hop counts keep rising after the trail is trimmed", async (t) => {
  const page = await site(t, "wikipedia", WIKI);
  const { trail } = walk(page.window, 80);
  assert.equal(page.window.hopsAlong(trail), 80);
});

test("the highest hop limit in the popup can be reached", async (t) => {
  const page = await site(t, "wikipedia", WIKI);
  const { trail } = walk(page.window, 50);
  assert.equal(page.window.isCheckInDue(page.window.hopsAlong(trail), 50, "hint"), true);
});

test("Hint and Pause check in every `limit` hops", async (t) => {
  const { window } = await site(t, "wikipedia", WIKI);
  const due = [4, 5, 6, 10].map((hops) => window.isCheckInDue(hops, 5, "pause"));
  assert.deepEqual(plain(due), [false, true, false, true]);
});

test("Block checks in on every hop past the limit", async (t) => {
  const { window } = await site(t, "wikipedia", WIKI);
  const due = [4, 5, 6].map((hops) => window.isCheckInDue(hops, 5, "block"));
  assert.deepEqual(plain(due), [false, true, true]);
});

test("going back along the trail shortens it and restores the hop count", async (t) => {
  const { window } = await site(t, "wikipedia", WIKI);
  const { trail } = walk(window, 3);
  const back = window.advanceTrail(trail, { title: "P1", url: "/p1" }, false);
  assert.equal(back.moved, false);
  assert.equal(window.hopsAlong(back.trail), 1);
});

test("arriving without following a link starts a new trail", async (t) => {
  const { window } = await site(t, "wikipedia", WIKI);
  const { trail } = walk(window, 3);
  const fresh = window.advanceTrail(trail, { title: "New", url: "/new" }, false);
  assert.deepEqual(
    plain(fresh.trail).map((p) => p.url),
    ["/new"]
  );
  assert.equal(window.hopsAlong(fresh.trail), 0);
});

test("saying this is a new topic resets the hop count", async (t) => {
  const page = await site(t, "wikipedia", WIKI);
  const { trail } = walk(page.window, 4);
  page.run(`session.set("trail", ${JSON.stringify(plain(trail))})`);
  page.window.startNewTopic();
  assert.equal(page.window.hopsAlong(page.run(`session.get("trail", [])`)), 0);
});
