// Discord content script (the web app at discord.com/channels/...).
// Depends on globals from the scripts listed before it in manifest.json.
//
// Discord's class names are generated ("unread_a1b2c3") and change with its
// builds, so matching relies on data attributes, URLs, and class-name prefixes.

// --- Selectors ---
// Selectors used only for hiding live in discord.css.
const SELECTORS = {
  // Channel rows in a server's channel list; data-list-item-id is "channels___<id>".
  channelRows: '[data-list-item-id^="channels___"]'
};

// Study channels are kept in chrome.storage.local, shared with the popup's Discord section.
// Each entry is { guild, channel, name, server }.
const STORAGE_KEY = STORAGE_KEYS.STUDY_CHANNELS;

// Discord updates the tab title, which names the channel, just after the URL.
const TITLE_UPDATE_DELAY_MS = 500;

// --- State ---

let studyChannels = [];

// --- Helpers ---

// { guild, channel } for /channels/<guild>/<channel>, or null on the friends
// list, settings, and other non-channel pages. Direct messages use guild "@me".
function currentChannel() {
  const match = location.pathname.match(/^\/channels\/([^/]+)\/(\d+)/);
  return match ? { guild: match[1], channel: match[2] } : null;
}

// Discord's tab title is "#channel | Server" (or "Discord | #channel | Server").
function channelNames() {
  const parts = document.title.split(" | ").filter((part) => part !== "Discord");
  const name = parts.find((part) => part.startsWith("#")) ?? parts[0] ?? "this channel";
  const server =
    parts[parts.indexOf(name) + 1] ?? (currentChannel()?.guild === "@me" ? "Direct messages" : "");
  return { name, server };
}

function isStudyChannel(channelId) {
  return studyChannels.some((c) => c.channel === channelId);
}

async function saveStudyChannels(list) {
  studyChannels = list;
  await chrome.storage.local.set({ [STORAGE_KEY]: list });
}

function markStudyChannel() {
  const ch = currentChannel();
  if (!ch || isStudyChannel(ch.channel)) return;
  closeOverlay();
  saveStudyChannels([...studyChannels, { ...ch, ...channelNames() }]);
  refresh();
}

function unmarkStudyChannel() {
  const ch = currentChannel();
  if (!ch) return;
  saveStudyChannels(studyChannels.filter((c) => c.channel !== ch.channel));
  refresh();
}

// Prefer a study channel in the server you're in.
function studyChannelToReturnTo() {
  const guild = currentChannel()?.guild;
  return studyChannels.find((c) => c.guild === guild) ?? studyChannels[0];
}

// Clicking Discord's own link keeps it a single-page navigation; a full load is the fallback.
function goToChannel({ guild, channel }) {
  closeOverlay();
  const path = `/channels/${guild}/${channel}`;
  const link = document.querySelector(`a[href="${path}"]`);
  if (link) link.click();
  else location.assign(path);
}

// --- Feature: study-channel focus ---
// Mark the channels you study in from the badge. Other channel rows are dimmed,
// and opening one checks in with you, at the strictness level's intensity.

function renderChannelBadge() {
  removeBadge();
  const ch = currentChannel();
  if (!ch || !siteActive() || !settings.discord.studyChannels) return;

  if (isStudyChannel(ch.channel)) {
    showBadge({
      label: "Study channel",
      text: channelNames().name,
      title: "Click to stop treating this as a study channel",
      onClick: unmarkStudyChannel,
      right: true
    });
  } else {
    showBadge({
      label: "Attention Sentry",
      text: "Mark as study channel",
      title: "Treat this channel as part of your studying",
      onClick: markStudyChannel,
      right: true
    });
  }
}

function checkChannel() {
  const ch = currentChannel();
  if (!ch || !studyChannels.length || isStudyChannel(ch.channel) || isOverlayOpen()) return;

  // Ask once per channel per tab session.
  const allowed = session.get("allowedChannels", []);
  if (allowed.includes(ch.channel)) return;
  const allow = () => session.set("allowedChannels", [...allowed, ch.channel]);

  const { name } = channelNames();
  const target = studyChannelToReturnTo();
  const studyList = studyChannels.map((c) => c.name).join(", ");

  if (settings.mode === "hint") {
    allow();
    showToast({
      title: `${name} isn't one of your study channels`,
      body: `Your study channels: ${studyList}`,
      technique: TECHNIQUES.offTopicChat
    });
    return;
  }

  const buttons = [
    { label: "It's for studying too", onClick: markStudyChannel },
    { label: `Back to ${target.name}`, primary: true, onClick: () => goToChannel(target) }
  ];
  if (settings.mode === "pause") {
    buttons.push({
      label: "Stay for now",
      countdown: LONG_COUNTDOWN_S,
      onClick: (close) => {
        allow();
        close();
      }
    });
  }

  showOverlay({
    title: `${name} isn't one of your study channels`,
    body: `You marked ${studyList} for studying. Is this channel part of it?`,
    technique: TECHNIQUES.offTopicChat,
    buttons,
    pauseVideos: false
  });
}

// Tag channel rows that aren't study channels, for discord.css to dim.
function tagChannelRows() {
  const focus = siteActive() && settings.discord.studyChannels && studyChannels.length > 0;
  for (const row of document.querySelectorAll(SELECTORS.channelRows)) {
    const id = row.getAttribute("data-list-item-id").slice("channels___".length);
    row.toggleAttribute("data-sm-offtopic", focus && !isStudyChannel(id));
  }
}

const setChannelObserving = createPageObserver(tagChannelRows, {
  throttleMs: MUTATION_THROTTLE_MS
});

function setChannelTagging(enabled) {
  tagChannelRows();
  setChannelObserving(enabled);
}

// --- Feature: hide unread badges ---

function explainBadgesOnce() {
  explainOnce(STORAGE_KEYS.DISCORD_BADGES_EXPLAINED, {
    title: "Unread badges on other servers are hidden",
    body: "Messages are still there when you're done studying.",
    technique: TECHNIQUES.unreadBadges
  });
}

// --- Applying settings ---

function applyPageClasses() {
  const on = siteActive();
  const dc = settings.discord;
  const html = document.documentElement.classList;
  html.toggle("sm-discord-focus", on && dc.studyChannels);
  html.toggle("sm-hide-badges", on && dc.hideBadges);
  setChannelTagging(on && dc.studyChannels);
}

// Redraw everything that depends on the current channel or the study-channel list.
function refresh() {
  applyPageClasses();
  renderChannelBadge();
}

function checkPage() {
  setTimeout(() => {
    refresh();
    if (siteActive() && settings.discord.studyChannels) checkChannel();
  }, TITLE_UPDATE_DELAY_MS);
}

function onActive() {
  if (settings.discord.hideBadges) explainBadgesOnce();
}

// --- Startup ---

(async function start() {
  ({ [STORAGE_KEY]: studyChannels = [] } = await chrome.storage.local.get(STORAGE_KEY));

  // The popup can remove study channels.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[STORAGE_KEY] && settings) {
      studyChannels = changes[STORAGE_KEY].newValue ?? [];
      refresh();
    }
  });

  // Discord is a single-page app.
  // "auto" follows Discord's theme class (theme-dark, theme-darker, theme-midnight...).
  startSite({
    site: "discord",
    spa: true,
    applyClasses: applyPageClasses,
    checkPage,
    onActive,
    isDark: () => {
      const html = document.documentElement.classList;
      if (html.contains("theme-light")) return false;
      if ([...html].some((name) => name.startsWith("theme-"))) return true;
      return systemPrefersDark();
    }
  });
})();
