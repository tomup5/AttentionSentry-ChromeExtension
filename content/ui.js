// Site-agnostic on-page UI: toasts and modal overlays.
// All class names and IDs are prefixed "sm-" to avoid clashing with the host page.

const TOAST_DURATION_MS = 12000;
const FOCUSABLE = "button:not(:disabled), select, input, a[href]";

// el("p", { class: "x", text: "hi", onclick: fn }, child1, child2)
// Text is always set via textContent, so user input is never parsed as HTML.
function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value);
  }
  for (const child of children) {
    if (child) node.append(child);
  }
  return node;
}

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

// --- Toasts ---

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

// --- Overlays ---

let currentOverlay = null; // only one overlay at a time

function isOverlayOpen() {
  return currentOverlay !== null;
}

// "play" doesn't bubble, but a capture-phase listener on document still
// sees it for every <video>, so this re-pauses anything that starts.
function blockPlayback(event) {
  event.target.pause();
}

// Wraps a Tab keypress around the controls in `container`.
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

/**
 * Show a full-screen modal overlay.
 *   title, body, technique: text content
 *   content: optional element (e.g. a form) placed above the buttons
 *   buttons: [{ label, primary, countdown, onClick }]
 *      countdown: seconds the button stays disabled
 *      onClick(close): call close() to dismiss the overlay
 *   pauseVideos: keep every video paused while the overlay is open
 * Returns { root, close, setButtons }, or null if an overlay is already open.
 */
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

  // Keep the site's keyboard shortcuts (YouTube's k, f, j...) from firing behind the
  // overlay, and keep Tab inside it, since everything behind it is unreachable.
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
  // The card rather than a button, so Enter or Space can't dismiss it by accident.
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
