// Toasts and modal overlays. Everything's prefixed sm- to stay clear of the host page.

const TOAST_DURATION_MS = 12000;
const FOCUSABLE = "button:not(:disabled), select, input, a[href]";

function whyLine(technique) {
  if (!technique) return null;
  return el(
    "p",
    { class: "sm-why" },
    el("strong", { text: `${technique.name}. ` }),
    technique.why,
    technique.source && el("span", { class: "sm-source", text: technique.source })
  );
}

function getToastStack() {
  let stack = document.getElementById("sm-toast-stack");
  if (!stack) {
    stack = el("div", { id: "sm-toast-stack", role: "status" });
    document.body.append(stack);
  }
  return stack;
}

function showToast({ title, body, technique, duration = TOAST_DURATION_MS }) {
  const toast = el(
    "div",
    { class: "sm-toast" },
    el("button", { class: "sm-close", text: "×", title: "Dismiss", onclick: () => toast.remove() }),
    el("h4", { text: title }),
    body ? el("p", { text: body }) : null,
    whyLine(technique)
  );
  getToastStack().append(toast);
  if (duration) setTimeout(() => toast.remove(), duration);
  return toast;
}

let currentOverlay = null; // only one at a time

function isOverlayOpen() {
  return currentOverlay !== null;
}

// play doesn't bubble, but capturing on document still sees it for every <video>
function blockPlayback(event) {
  event.target.pause();
}

function keepFocusInside(event, container) {
  const controls = [...container.querySelectorAll(FOCUSABLE)];
  const position = controls.indexOf(document.activeElement);
  if (!controls.length) {
    event.preventDefault();
  } else if (event.shiftKey && position <= 0) {
    event.preventDefault();
    controls[controls.length - 1].focus();
  } else if (!event.shiftKey && position === controls.length - 1) {
    event.preventDefault();
    controls[0].focus();
  }
}

// buttons: [{ label, primary, countdown (seconds disabled), onClick(close) }]
// Returns { root, close, setButtons }, or null if one is already open.
function showOverlay({ title, body, technique, content, buttons = [], pauseVideos = true }) {
  if (currentOverlay) return null;

  const buttonRow = el("div", { class: "sm-buttons" });
  const card = el(
    "div",
    {
      class: "sm-card",
      role: "dialog",
      "aria-modal": "true",
      "aria-labelledby": "sm-overlay-title",
      tabindex: "-1"
    },
    el("div", { class: "sm-label", text: "Attention Sentry" }),
    el("h2", { id: "sm-overlay-title", text: title }),
    body ? el("p", { class: "sm-body", text: body }) : null,
    content || null,
    buttonRow,
    whyLine(technique)
  );
  const root = el("div", { class: "sm-overlay" }, card);

  // Stop the site's shortcuts (YouTube's k, f, j...) firing behind the overlay
  // and keep Tab inside it
  root.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Tab") keepFocusInside(e, card);
  });

  const previousFocus = document.activeElement;
  const timers = [];

  function setButtons(list) {
    timers.forEach(clearInterval);
    buttonRow.replaceChildren();
    for (const b of list) {
      const btn = el("button", {
        class: b.primary ? "sm-btn sm-primary" : "sm-btn",
        text: b.label,
        onclick: () => b.onClick(close)
      });
      if (b.countdown) {
        let left = b.countdown;
        btn.disabled = true;
        btn.textContent = `${b.label} (${left})`;
        const timer = setInterval(() => {
          left--;
          if (left <= 0) {
            clearInterval(timer);
            btn.disabled = false;
            btn.textContent = b.label;
          } else {
            btn.textContent = `${b.label} (${left})`;
          }
        }, 1000);
        timers.push(timer);
      }
      buttonRow.append(btn);
    }
  }

  function close() {
    timers.forEach(clearInterval);
    root.remove();
    document.documentElement.classList.remove("sm-noscroll");
    document.removeEventListener("play", blockPlayback, true);
    currentOverlay = null;
    previousFocus?.focus?.({ preventScroll: true });
  }

  setButtons(buttons);
  document.body.append(root);
  document.documentElement.classList.add("sm-noscroll");
  // Focus the card and not a button so Enter/Space can't dismiss it by accident
  card.focus({ preventScroll: true });

  if (pauseVideos) {
    document.querySelectorAll("video").forEach((v) => v.pause());
    document.addEventListener("play", blockPlayback, true);
  }

  currentOverlay = { root, close, setButtons };
  return currentOverlay;
}

function closeOverlay() {
  if (currentOverlay) currentOverlay.close();
}

function clearAllUI() {
  closeOverlay();
  document.getElementById("sm-toast-stack")?.remove();
}
