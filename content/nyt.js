// New York Times content script (www.nytimes.com, including Games).
// Depends on globals from the scripts listed before it in manifest.json.

// --- Selectors ---
// Selectors used only for hiding live in nyt.css.
const SELECTORS = {
  articleBody: 'section[name="articleBody"], #story',
  headings: "h2, h3, h4, [role='heading']"
};

// Headings of the modules that send you to another article. Matched by text,
// like YouTube's metrics, because the Times' class names are generated.
const RECIRC_HEADING =
  /^(most popular|trending|editors[’']? picks|more to read|read next|what to read next|related content|recommended for you|you may also like|more in [\w ]+)$/i;
const RECIRC_MAX_LENGTH = 40;

// Path keyword → display name. Games live under /games/, /crosswords/, and /puzzles/.
const GAMES = {
  wordle: "Wordle",
  connections: "Connections",
  "spelling-bee": "Spelling Bee",
  strands: "Strands",
  mini: "The Mini",
  "letter-boxed": "Letter Boxed",
  tiles: "Tiles",
  vertex: "Vertex",
  sudoku: "Sudoku",
  crossword: "the Crossword"
};
const GAME_COUNTDOWN = 15; // seconds, in Pause mode

// --- Helpers ---

function pageType() {
  const path = location.pathname;
  if (/^\/(games|crosswords|puzzles)(\/|$)/.test(path)) return "game";
  if (/^\/(international\/?)?$/.test(path)) return "home";
  if (/^\/(live\/|interactive\/)?\d{4}\/\d{2}\/\d{2}\//.test(path)) return "article";
  return "other";
}

function gameName() {
  const path = location.pathname;
  const key = Object.keys(GAMES).find((name) => path.includes(name));
  return key ? GAMES[key] : "NYT Games";
}

// --- Feature: intention check ---
// Only on the front page; links straight to an article (say, from a class
// reading list) go through without asking.

const INTENTION = {
  siteName: "The New York Times",
  reasons: [
    { value: "class", label: "Read for a class or assignment", studying: true },
    { value: "research", label: "Research a topic", studying: true },
    { value: "news", label: "Catch up on the news", studying: false },
    { value: "unsure", label: "Not sure / just opened it", studying: false }
  ],
  placeholder: 'What exactly? (optional, e.g. "op-ed for English 101")'
};

// --- Feature: games check ---
// Asks once per game per tab session, before you start playing.

function checkGame() {
  const game = gameName();
  const allowed = session.get("gamesAllowed", []);
  if (allowed.includes(game) || isOverlayOpen()) return;
  const allow = () => session.set("gamesAllowed", [...allowed, game]);

  if (settings.mode === "hint") {
    allow();
    showToast({
      title: `${game} while you study?`,
      body: goalReminder(),
      technique: TECHNIQUES.dailyGames
    });
    return;
  }

  const back = { label: "Back to studying", primary: true, onClick: goBack };
  showOverlay({
    title: settings.mode === "block" ? `${game} is off while you study` : `Play ${game} now?`,
    body:
      settings.mode === "block"
        ? "It'll be here when you turn Attention Sentry off. Today's puzzle doesn't go anywhere."
        : "Today's puzzle will still be here after you study.",
    technique: TECHNIQUES.dailyGames,
    buttons:
      settings.mode === "block"
        ? [back]
        : [
            back,
            {
              label: "Play anyway",
              countdown: GAME_COUNTDOWN,
              onClick: (close) => {
                allow();
                close();
              }
            }
          ],
    pauseVideos: false
  });
}

// --- Feature: article count check-in ---

function handleArticle() {
  const count = session.addToSet("articlesSeen", location.pathname);
  if (!settings.nyt.articleCheck || count === null || count < settings.nyt.articleLimit) return;
  if (isOverlayOpen()) return;
  showCountCheckIn({
    noun: "Article",
    count,
    technique: TECHNIQUES.articleChain,
    pauseVideos: false
  });
}

// --- Feature: hide "More to read" ---
// Modules are found by their heading text and tagged [data-sm-recirc] for nyt.css.
// The tag goes on the closest section or aside (or test-id wrapper), but never
// on one that contains the article or is big enough to be a whole page column.

// A recommendation module has a handful of links; more means a larger wrapper.
const RECIRC_MAX_LINKS = 25;

function tagRecirc() {
  const article = document.querySelector(SELECTORS.articleBody);
  for (const heading of document.querySelectorAll(SELECTORS.headings)) {
    const text = heading.textContent.trim();
    if (text.length > RECIRC_MAX_LENGTH || !RECIRC_HEADING.test(text)) continue;
    const module = heading.closest("aside, section") ?? heading.closest("[data-testid]");
    if (!module || module.matches("main, body") || (article && module.contains(article))) continue;
    if (module.querySelectorAll("a").length > RECIRC_MAX_LINKS) continue;
    module.setAttribute("data-sm-recirc", "");
  }
}

const setRecircObserving = createPageObserver(tagRecirc, { throttleMs: MUTATION_THROTTLE_MS });

function setRecircTagging(enabled) {
  if (enabled) tagRecirc();
  setRecircObserving(enabled);
}

// --- Applying settings ---

function applyPageClasses() {
  const on = siteActive();
  document.documentElement.classList.toggle("sm-hide-recirc", on && settings.nyt.hideRecirc);
  setRecircTagging(on && settings.nyt.hideRecirc);
}

function checkPage() {
  const type = pageType();
  if (type === "home" && settings.nyt.intention && !session.get("intentionAsked", false)) {
    showIntentionScreen(INTENTION);
  }
  if (type === "game" && settings.nyt.games) checkGame();
  if (type === "article") handleArticle();
}

function onActive() {
  renderIntentionBadge(INTENTION);
}

// --- Startup ---

// Games and some sections switch pages without a full load.
// The Times has no dark theme, so "auto" uses the light one.
startSite({
  site: "nyt",
  spa: true,
  applyClasses: applyPageClasses,
  checkPage,
  onActive,
  isDark: () => false
});
