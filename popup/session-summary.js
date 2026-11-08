// "This session" card for the active tab

const sessionSection = document.getElementById("session");
const sessionTitle = sessionSection.querySelector(".section-title");
const sessionGoal = document.getElementById("session-goal");
const sessionStats = document.getElementById("session-stats");

// Written by the content scripts, see content/session.js for the shape
async function renderSession() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const key = tab && tabSessionKey(tab.id);
  const entry = key ? (await chrome.storage.session.get(key))[key] : null;
  const site = SITE_SECTIONS.find((s) => s.key === entry?.lastSite);
  const data = site ? entry[site.key] : null;

  const videos = data?.videosSeen?.length ?? 0;
  const articles = data?.articlesSeen?.length ?? 0;
  const minutes = Math.round((data?.activeMs ?? 0) / MS_PER_MINUTE);
  const goal = formatIntention(data?.intention);

  const stats = [];
  if (videos) stats.push(`${videos} ${videos === 1 ? "video" : "videos"}`);
  if (articles) stats.push(`${articles} ${articles === 1 ? "article" : "articles"}`);
  stats.push(formatDuration(minutes));

  sessionSection.hidden = !goal && !videos && !articles && !minutes;
  if (site) sessionTitle.textContent = `This session on ${site.name}`;
  sessionGoal.textContent = goal ? `Goal: ${goal}` : "No goal set";
  sessionStats.textContent = stats.join(" · ");
}

function formatDuration(minutes) {
  if (minutes < 1) return "under a minute";
  if (minutes < 60) return `${minutes} min`;
  const rest = minutes % 60;
  return `${Math.floor(minutes / 60)} hr${rest ? ` ${rest} min` : ""}`;
}
