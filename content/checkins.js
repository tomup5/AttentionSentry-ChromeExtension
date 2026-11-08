// Prompts used by more than one site.

const SHORT_COUNTDOWN_S = 5;
const LONG_COUNTDOWN_S = 10;

// Only one badge per page (goal, starting article, or study channel)

function showBadge({ label, text, title, onClick, right = false }) {
  removeBadge();
  const badge = el(
    "button",
    { id: "sm-badge", class: right ? "sm-badge-right" : "", title, onclick: onClick },
    el("span", { class: "sm-badge-label", text: label }),
    text
  );
  document.body.append(badge);
}

function removeBadge() {
  document.getElementById("sm-badge")?.remove();
}

// config: { siteName, reasons: [{ value, label, studying }], placeholder, onAccept? }
// onAccept runs after the overlay closes, e.g. to resume the video

function intentionText() {
  return formatIntention(session.get("intention", null));
}

function goalReminder() {
  const text = intentionText();
  return text ? `You came here for: ${text}` : null;
}

function showIntentionScreen(config) {
  const mode = settings.mode;

  const select = el(
    "select",
    { class: "sm-select" },
    el("option", { value: "", text: "Choose a reason…" }),
    ...config.reasons.map((r) => el("option", { value: r.value, text: r.label }))
  );
  const note = el("input", {
    class: "sm-input",
    type: "text",
    maxlength: "80",
    placeholder: config.placeholder
  });
  const form = el("div", { class: "sm-form" }, select, note);

  const overlay = showOverlay({
    title: `What brings you to ${config.siteName}?`,
    body: "Say why you're here before you go on.",
    technique: TECHNIQUES.intention,
    content: form
  });
  if (!overlay) return;

  function accept(reason) {
    session.set("intention", {
      reason: reason?.value || "skipped",
      label: reason?.label || "No reason given",
      note: note.value.trim()
    });
    session.set("intentionAsked", true);
    overlay.close();
    renderIntentionBadge(config);
    config.onAccept?.();
  }

  // Buttons depend on the mode and which reason is picked
  function updateButtons() {
    const reason = config.reasons.find((r) => r.value === select.value);

    if (mode === "hint") {
      overlay.setButtons([
        { label: "Skip", onClick: () => accept(null) },
        { label: "Continue", primary: true, onClick: () => accept(reason) }
      ]);
      return;
    }

    // Pause and Block need a reason
    if (!reason) {
      overlay.setButtons([{ label: "Pick a reason first", onClick: () => select.focus() }]);
      return;
    }

    if (reason.studying) {
      overlay.setButtons([{ label: "Continue", primary: true, onClick: () => accept(reason) }]);
    } else if (mode === "pause") {
      overlay.setButtons([
        { label: "Back to studying", primary: true, onClick: goBack },
        { label: "Continue anyway", countdown: LONG_COUNTDOWN_S, onClick: () => accept(reason) }
      ]);
    } else {
      // Block: only way through is turning the extension off
      overlay.setButtons([{ label: "Back to studying", primary: true, onClick: goBack }]);
    }
  }

  select.addEventListener("change", updateButtons);
  updateButtons();
}

// Bottom-left reminder, click to change it
function renderIntentionBadge(config) {
  removeBadge();
  const text = intentionText();
  if (!text || !siteActive() || !siteSettings().intention) return;
  showBadge({
    label: "Goal",
    text,
    title: "Click to change your reason",
    onClick: () => showIntentionScreen(config)
  });
}

// For infinite feeds. Uses scrollNudge/scrollScreens from the site's settings.
// stopFeed only gets called in Block mode. Call reset() on every navigation.

function createScrollNudge({ siteName, isFeed, stopFeed }) {
  let nudgesShown = 0;

  function onScroll() {
    if (!siteActive() || !siteSettings().scrollNudge) return;
    if (!isFeed() || isOverlayOpen()) return;

    // Recalculated every time so changing the limit in the popup works right away
    const screens = window.scrollY / window.innerHeight;
    if (screens < siteSettings().scrollScreens * (nudgesShown + 1)) return;

    nudgesShown++;
    const depth = Math.round(screens);
    const close = { label: `Close ${siteName}`, primary: true, onClick: closeTab };

    if (settings.mode === "hint") {
      showToast({
        title: `You've scrolled about ${depth} screens down`,
        body: goalReminder(),
        technique: TECHNIQUES.infiniteScroll
      });
    } else if (settings.mode === "pause") {
      showOverlay({
        title: `${depth} screens of scrolling`,
        body: "Is what you need really further down?",
        technique: TECHNIQUES.infiniteScroll,
        buttons: [
          close,
          { label: "Keep scrolling", countdown: LONG_COUNTDOWN_S, onClick: (c) => c() }
        ]
      });
    } else {
      stopFeed();
      showOverlay({
        title: "This feed now has a bottom",
        body: `We stopped ${siteName} from loading more. If you need something specific, search for it.`,
        technique: TECHNIQUES.infiniteScroll,
        buttons: [close, { label: "OK", onClick: (c) => c() }]
      });
    }
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  return {
    reset() {
      nudgesShown = 0;
    }
  };
}

// Used for the YouTube video count and the NYT article count

function showCountCheckIn({ noun, count, technique, onContinue, pauseVideos = true }) {
  const body = goalReminder() ?? "Is this still part of what you're studying?";

  if (settings.mode === "hint") {
    showToast({ title: `${noun} #${count} this study session`, body, technique });
    return;
  }

  showOverlay({
    title: `${noun} #${count}: is this for your studying?`,
    body,
    technique,
    pauseVideos,
    buttons: [
      { label: "Go back", onClick: goBack },
      {
        label: "Yes, it's for studying",
        primary: true,
        countdown: settings.mode === "pause" ? SHORT_COUNTDOWN_S : 0,
        onClick: (close) => {
          close();
          onContinue?.();
        }
      }
    ]
  });
}

// Only ever shows once, tracked in local storage
async function explainOnce(storageKey, toast) {
  const { [storageKey]: explained } = await chrome.storage.local.get(storageKey);
  if (explained) return;
  await chrome.storage.local.set({ [storageKey]: true });
  showToast(toast);
}
