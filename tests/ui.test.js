const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadScripts } = require("./helpers/harness");

const UI = ["shared/common.js", "content/ui.js"];

function page(t) {
  const loaded = loadScripts(UI);
  t.after(loaded.close);
  return loaded;
}

function pressTab(window, target, shiftKey = false) {
  const event = new window.KeyboardEvent("keydown", {
    key: "Tab",
    shiftKey,
    bubbles: true,
    cancelable: true
  });
  target.dispatchEvent(event);
  return event;
}

const twoButtons = [
  { label: "First", onClick: () => {} },
  { label: "Last", primary: true, onClick: () => {} }
];

test("only one overlay can be open at a time", (t) => {
  const { window } = page(t);
  assert.ok(window.showOverlay({ title: "One" }));
  assert.equal(window.showOverlay({ title: "Two" }), null);
});

test("an overlay is labelled by its title", (t) => {
  const { window, document } = page(t);
  window.showOverlay({ title: "Why are you here?" });
  const dialog = document.querySelector('[role="dialog"]');
  const label = document.getElementById(dialog.getAttribute("aria-labelledby"));
  assert.equal(label.textContent, "Why are you here?");
});

test("opening an overlay moves focus inside it", (t) => {
  const { window, document } = page(t);
  window.showOverlay({ title: "Focus", buttons: twoButtons });
  assert.ok(document.querySelector(".sm-overlay").contains(document.activeElement));
});

test("Tab from the last control wraps to the first", (t) => {
  const { window, document } = page(t);
  window.showOverlay({ title: "Trap", buttons: twoButtons });
  const [first, last] = document.querySelectorAll(".sm-btn");
  last.focus();
  const event = pressTab(window, last);
  assert.equal(document.activeElement, first);
  assert.ok(event.defaultPrevented);
});

test("Shift+Tab from the first control wraps to the last", (t) => {
  const { window, document } = page(t);
  window.showOverlay({ title: "Trap", buttons: twoButtons });
  const [first, last] = document.querySelectorAll(".sm-btn");
  first.focus();
  pressTab(window, first, true);
  assert.equal(document.activeElement, last);
});

test("closing an overlay returns focus to where it was", (t) => {
  const { window, document } = page(t);
  const opener = document.createElement("button");
  document.body.append(opener);
  opener.focus();
  window.showOverlay({ title: "Back" });
  window.closeOverlay();
  assert.equal(document.activeElement, opener);
});

test("keys pressed in an overlay don't reach the host page", (t) => {
  const { window, document } = page(t);
  let reached = false;
  document.addEventListener("keydown", () => (reached = true));
  window.showOverlay({ title: "Typing", buttons: twoButtons });
  document
    .querySelector(".sm-btn")
    .dispatchEvent(new window.KeyboardEvent("keydown", { key: "k", bubbles: true }));
  assert.equal(reached, false);
});

test("a countdown button starts disabled and shows the seconds left", (t) => {
  const { window, document } = page(t);
  window.showOverlay({
    title: "Wait",
    buttons: [{ label: "Continue", countdown: 10, onClick: () => {} }]
  });
  const button = document.querySelector(".sm-btn");
  assert.equal(button.disabled, true);
  assert.equal(button.textContent, "Continue (10)");
  window.closeOverlay();
});

test("toasts are announced to assistive technology", (t) => {
  const { window, document } = page(t);
  window.showToast({ title: "Saved" });
  assert.equal(document.getElementById("sm-toast-stack").getAttribute("role"), "status");
});

test("clearAllUI removes the overlay and toasts", (t) => {
  const { window, document } = page(t);
  window.showOverlay({ title: "Gone" });
  window.showToast({ title: "Gone too" });
  window.clearAllUI();
  assert.equal(window.isOverlayOpen(), false);
  assert.equal(document.querySelector(".sm-toast"), null);
});
