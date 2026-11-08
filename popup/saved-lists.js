// Lists kept in chrome.storage.local by the content scripts:
// Wikipedia tangents and Discord study channels.

const lists = {};

function buildExtra(name) {
  if (name === "savedTangents") {
    lists.savedTangents = el("ul");
    return el(
      "div",
      { class: "saved", id: "saved-tangents", hidden: "" },
      el(
        "div",
        { class: "saved-head" },
        el("span", { text: "Saved for later" }),
        el("button", {
          class: "text-button",
          type: "button",
          text: "Clear",
          onclick: clearSavedTangents
        })
      ),
      lists.savedTangents
    );
  }
  lists.studyChannels = el("ul");
  lists.studyChannelsEmpty = el("p", {
    class: "saved-empty",
    text: "None yet. Open a channel in Discord and click “Mark as study channel”."
  });
  return el(
    "div",
    { class: "saved" },
    el("div", { class: "saved-head" }, el("span", { text: "Study channels" })),
    lists.studyChannels,
    lists.studyChannelsEmpty
  );
}

function isWikipediaUrl(raw) {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && /(^|\.)wikipedia\.org$/.test(url.hostname);
  } catch {
    return false;
  }
}

function renderSavedTangents(saved = []) {
  document.getElementById("saved-tangents").hidden = !saved.length;
  lists.savedTangents.replaceChildren(
    ...saved.map((item) =>
      el(
        "li",
        {},
        el("button", {
          type: "button",
          class: "text-button saved-name",
          text: item.title,
          title: `${item.title}, saved while reading about ${item.from}`,
          onclick: () => isWikipediaUrl(item.url) && chrome.tabs.create({ url: item.url })
        }),
        removeButton(item.title, () => removeSavedTangent(item.url))
      )
    )
  );
}

async function removeSavedTangent(url) {
  const { [STORAGE_KEYS.SAVED_TANGENTS]: savedTangents = [] } = await chrome.storage.local.get(
    STORAGE_KEYS.SAVED_TANGENTS
  );
  await chrome.storage.local.set({
    [STORAGE_KEYS.SAVED_TANGENTS]: savedTangents.filter((i) => i.url !== url)
  });
}

function clearSavedTangents() {
  chrome.storage.local.set({ [STORAGE_KEYS.SAVED_TANGENTS]: [] });
}

function renderStudyChannels(channels = []) {
  lists.studyChannelsEmpty.hidden = channels.length > 0;
  lists.studyChannels.replaceChildren(
    ...channels.map((c) =>
      el(
        "li",
        {},
        el("span", { class: "saved-name", text: c.server ? `${c.name} · ${c.server}` : c.name }),
        removeButton(c.name, () => removeStudyChannel(c.channel))
      )
    )
  );
}

async function removeStudyChannel(channel) {
  const { [STORAGE_KEYS.STUDY_CHANNELS]: studyChannels = [] } = await chrome.storage.local.get(
    STORAGE_KEYS.STUDY_CHANNELS
  );
  await chrome.storage.local.set({
    [STORAGE_KEYS.STUDY_CHANNELS]: studyChannels.filter((c) => c.channel !== channel)
  });
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  const tangents = changes[STORAGE_KEYS.SAVED_TANGENTS];
  const channels = changes[STORAGE_KEYS.STUDY_CHANNELS];
  if (tangents) renderSavedTangents(tangents.newValue);
  if (channels) renderStudyChannels(channels.newValue);
});
