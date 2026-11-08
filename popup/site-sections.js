// The popup's collapsible sections: one per site, plus their saved order.

// One collapsible section per site. Each feature is a row with a switch for
// settings[site][key]; `sub` adds a checkbox or number below the description,
// and `extra` names a list built by buildExtra().
const SITE_SECTIONS = [
  {
    key: "youtube",
    name: "YouTube",
    icon: "youtube",
    features: [
      {
        key: "intention",
        title: "Intention check",
        desc: "Ask why you're opening YouTube before it loads."
      },
      {
        key: "hideMetrics",
        title: "Hide metrics",
        desc: "Hide views, likes, and subscriber counts.",
        sub: { type: "checkbox", key: "blurThumbnails", label: "Blur thumbnails until hover" }
      },
      {
        key: "scrollNudge",
        title: "Scroll limit",
        desc: "Step in after a long scroll through the feed or Shorts.",
        sub: {
          type: "number",
          key: "scrollScreens",
          min: 3,
          max: 100,
          before: "After",
          after: "screens"
        }
      },
      {
        key: "rabbitHole",
        title: "Rabbit-hole guard",
        desc: "Turn off autoplay and check in between videos."
      }
    ]
  },
  {
    key: "reddit",
    name: "Reddit",
    icon: "reddit",
    features: [
      {
        key: "intention",
        title: "Intention check",
        desc: "Ask why you're here when you open the home or Popular feed."
      },
      {
        key: "hideMetrics",
        title: "Hide metrics",
        desc: "Hide upvotes, comment counts, members, and karma."
      },
      {
        key: "scrollNudge",
        title: "Scroll limit",
        desc: "Step in after a long scroll through a feed.",
        sub: {
          type: "number",
          key: "scrollScreens",
          min: 3,
          max: 100,
          before: "After",
          after: "screens"
        }
      },
      {
        key: "hideSidebars",
        title: "Hide sidebars",
        desc: "Hide Popular, Explore, Recent, and the right-hand column."
      }
    ]
  },
  {
    key: "wikipedia",
    name: "Wikipedia",
    icon: "wikipedia",
    features: [
      {
        key: "rabbitHole",
        title: "Rabbit-hole tracker",
        desc: "Count the links you follow away from where you started, and check in.",
        sub: { type: "number", key: "hopLimit", min: 2, max: 50, before: "After", after: "links" },
        sub2: {
          type: "checkbox",
          key: "topicBadge",
          label: "Show a link back to where you started"
        }
      },
      {
        key: "saveTangents",
        title: "Save tangents",
        desc: "Hover a link to save it for after you study.",
        extra: "savedTangents"
      },
      {
        key: "hideMainPage",
        title: "Hide Main Page extras",
        desc: "Hide Did you know, In the news, and Random article."
      }
    ]
  },
  {
    key: "discord",
    name: "Discord",
    icon: "discord",
    features: [
      {
        key: "studyChannels",
        title: "Study-channel focus",
        desc: "Mark the channels you study in. Others are dimmed and check in when you open them.",
        extra: "studyChannels"
      },
      {
        key: "hideBadges",
        title: "Hide unread badges",
        desc: "Hide mention counts and unread dots on servers."
      }
    ]
  },
  {
    key: "nyt",
    name: "New York Times",
    icon: "nyt",
    features: [
      {
        key: "intention",
        title: "Intention check",
        desc: "Ask why you're here when you open the front page."
      },
      {
        key: "games",
        title: "Games check",
        desc: "Step in before Wordle, Connections, and other games."
      },
      {
        key: "articleCheck",
        title: "Article check-in",
        desc: "Check in once you've read several articles.",
        sub: {
          type: "number",
          key: "articleLimit",
          min: 2,
          max: 50,
          before: "From article",
          after: "on"
        }
      },
      {
        key: "hideRecirc",
        title: "Hide 'More to read'",
        desc: "Hide Most Popular, Trending, and recommended articles."
      }
    ]
  }
];

const blockerSection = document.querySelector('[data-section="siteBlock"]');

// Keys of the expanded sections, remembered in chrome.storage.local.
let openSections = [];

// Filled in by buildSiteSections().
// Each [data-setting] input maps to settings[site][key], written "site.key".
let featureInputs = [];

function switchControl(setting, label) {
  return el(
    "label",
    { class: "switch" },
    el("input", { type: "checkbox", "data-setting": setting, "aria-label": label }),
    el("span", { class: "slider" })
  );
}

function subOption(site, sub) {
  const setting = `${site}.${sub.key}`;
  if (sub.type === "checkbox") {
    return el(
      "label",
      { class: "sub-option" },
      el("input", { type: "checkbox", "data-setting": setting }),
      sub.label
    );
  }
  return el(
    "label",
    { class: "sub-option" },
    sub.before,
    el("input", { type: "number", min: sub.min, max: sub.max, "data-setting": setting }),
    sub.after
  );
}

function featureRow(site, feature) {
  return el(
    "div",
    { class: "row" },
    el(
      "div",
      { class: "row-text" },
      el("h3", { text: feature.title }),
      el("p", { text: feature.desc }),
      feature.sub && subOption(site, feature.sub),
      feature.sub2 && subOption(site, feature.sub2),
      feature.extra && buildExtra(feature.extra)
    ),
    switchControl(`${site}.${feature.key}`, feature.title)
  );
}

function buildSiteSections() {
  const chevron = blockerSection.querySelector(".chevron");
  for (const site of SITE_SECTIONS) {
    const head = el(
      "div",
      { class: "site-head" },
      el(
        "button",
        { class: "site-toggle", type: "button", "aria-expanded": "false" },
        chevron.cloneNode(true),
        el("img", { class: "site-icon", src: `../icons/sites/${site.icon}.png`, alt: "" }),
        el("span", { class: "site-name", text: site.name }),
        el("span", { class: "count" })
      ),
      switchControl(`${site.key}.enabled`, `${site.name} features`)
    );
    head.querySelector(".switch").title = `Turn ${site.name} features on or off`;

    const body = el("div", { class: "site-body", hidden: "" });
    body.append(...site.features.map((feature) => featureRow(site.key, feature)));
    blockerSection.before(
      el("section", { class: "section site", "data-section": site.key }, head, body)
    );
  }
  featureInputs = document.querySelectorAll("[data-setting]");

  // Up and down arrows in every section header, just before its switch.
  for (const section of document.querySelectorAll("[data-section]")) {
    const key = section.dataset.section;
    const name = section.querySelector(".site-name").textContent;
    const arrow = (dir, label, d) =>
      el(
        "button",
        {
          class: "move-button",
          type: "button",
          "data-dir": dir,
          title: label,
          "aria-label": `${label}: ${name}`
        },
        moveIcon(d)
      );
    const move = el(
      "div",
      { class: "move" },
      arrow("-1", "Move up", "M6 15l6-6 6 6"),
      arrow("1", "Move down", "M6 9l6 6 6-6")
    );
    move.addEventListener("click", (e) => {
      const button = e.target.closest(".move-button");
      if (button) moveSection(key, Number(button.dataset.dir));
    });
    section.querySelector(".site-head .switch").before(move);
  }
}

function moveIcon(d) {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "12");
  svg.setAttribute("height", "12");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(ns, "path");
  for (const [attr, value] of Object.entries({
    d,
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "2.4",
    "stroke-linecap": "round",
    "stroke-linejoin": "round"
  })) {
    path.setAttribute(attr, value);
  }
  svg.append(path);
  return svg;
}

// The saved order, minus keys that no longer exist, plus any new sections at the end.
function currentOrder() {
  const keys = [...SITE_SECTIONS.map((s) => s.key), "siteBlock"];
  const saved = Array.isArray(settings.sectionOrder) ? settings.sectionOrder : [];
  return [
    ...saved.filter((k, i) => keys.includes(k) && saved.indexOf(k) === i),
    ...keys.filter((k) => !saved.includes(k))
  ];
}

function moveSection(key, dir) {
  const order = currentOrder();
  const from = order.indexOf(key);
  const to = from + dir;
  if (to < 0 || to >= order.length) return;
  [order[from], order[to]] = [order[to], order[from]];
  settings.sectionOrder = order;
  update();
}

// Puts the sections in the saved order and disables the arrows at either end.
function renderOrder() {
  const order = currentOrder();
  order.forEach((key, i) => {
    const section = document.querySelector(`[data-section="${key}"]`);
    controls.append(section);
    section.querySelector('[data-dir="-1"]').disabled = i === 0;
    section.querySelector('[data-dir="1"]').disabled = i === order.length - 1;
  });
}

function renderSections() {
  for (const section of document.querySelectorAll("[data-section]")) {
    const open = openSections.includes(section.dataset.section);
    section.querySelector(".site-body").hidden = !open;
    section.querySelector(".site-toggle").setAttribute("aria-expanded", open);
  }
}

function toggleSection(key) {
  openSections = openSections.includes(key)
    ? openSections.filter((k) => k !== key)
    : [...openSections, key];
  chrome.storage.local.set({ [STORAGE_KEYS.OPEN_SECTIONS]: openSections });
  renderSections();
}
