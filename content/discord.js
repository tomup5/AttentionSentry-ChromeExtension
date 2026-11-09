// Content script for the Discord web app.
//
// Class names are generated ("unread_a1b2c3") and change between builds, so
// everything here matches on data attributes, URLs, or class-name prefixes.

const SELECTORS = {
  // data-list-item-id looks like "channels___<id>"
  channelRows: '[data-list-item-id^="channels___"]'
};

// Also read by the popup. Entries are { guild, channel, name, server }.
const STORAGE_KEY = STORAGE_KEYS.STUDY_CHANNELS;

// Discord changes the tab title (which has the channel name) a bit after the URL
const TITLE_UPDATE_DELAY_MS = 500;

let studyChannels = [];

// null on the friends list, settings, etc. DMs use guild "@me".
function currentChannel() {
  const match = location.pathname.match(/^\/channels\/([^/]+)\/(\d+)/);
  return match ? { guild: match[1], channel: match[2] } : null;
}

// Tab title is "#channel | Server" or "Discord | #channel | Server"
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

// Prefer one in the current server
function studyChannelToReturnTo() {
  const guild = currentChannel()?.guild;
  return studyChannels.find((c) => c.guild === guild) ?? studyChannels[0];
}

// Clicking Discord's own link keeps it an SPA navigation, full load is the fallback
function goToChannel({ guild, channel }) {
  closeOverlay();
  const path = `/channels/${guild}/${channel}`;
  const link = /** @type {HTMLElement} */ (document.querySelector(`a[href="${path}"]`));
  if (link) link.click();
  else location.assign(path);
}

// Channels you mark from the badge stay normal. Everything else gets dimmed and
// opening one triggers a check-in.

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

  // Only ask once per channel per tab
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

  /** @type {OverlayButton[]} */
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
    body: `You said ${studyList} ${studyChannels.length === 1 ? "was" : "were"} for studying. Is this one too?`,
    technique: TECHNIQUES.offTopicChat,
    buttons,
    pauseVideos: false
  });
}

// discord.css dims these
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

function explainBadgesOnce() {
  explainOnce(STORAGE_KEYS.DISCORD_BADGES_EXPLAINED, {
    title: "Hid your unread badges",
    body: "Your messages aren't going anywhere. Check them when you're done.",
    technique: TECHNIQUES.unreadBadges
  });
}

function applyPageClasses() {
  const on = siteActive();
  const dc = settings.discord;
  const html = document.documentElement.classList;
  html.toggle("sm-discord-focus", on && dc.studyChannels);
  html.toggle("sm-hide-badges", on && dc.hideBadges);
  setChannelTagging(on && dc.studyChannels);
}

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

(async function start() {
  ({ [STORAGE_KEY]: studyChannels = [] } = /** @type {any} */ (
    await chrome.storage.local.get(STORAGE_KEY)
  ));

  // Popup can remove channels
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[STORAGE_KEY] && settings) {
      studyChannels = /** @type {any[]} */ (changes[STORAGE_KEY].newValue ?? []);
      refresh();
    }
  });

  // "auto" follows Discord's theme class (theme-dark, theme-darker, theme-midnight...)
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
