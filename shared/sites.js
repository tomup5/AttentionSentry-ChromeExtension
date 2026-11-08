// Sites that can be blocked. Subdomains are covered automatically.

const BLOCKABLE_SITES = {
  tiktok: { label: "TikTok", domains: ["tiktok.com"] },
  instagram: { label: "Instagram", domains: ["instagram.com"] },
  snapchat: { label: "Snapchat", domains: ["snapchat.com"] },
  x: { label: "X (Twitter)", domains: ["x.com", "twitter.com"] },
  facebook: { label: "Facebook", domains: ["facebook.com"] },
  tumblr: { label: "Tumblr", domains: ["tumblr.com"] },
  twitch: { label: "Twitch", domains: ["twitch.tv"] },
  netflix: { label: "Netflix", domains: ["netflix.com"] },
  pinterest: {
    label: "Pinterest",
    domains: ["pinterest.com", "pinterest.co.uk", "pinterest.ca", "pinterest.com.au", "pin.it"]
  }
};

// How long "Open anyway" lets a site through
const UNLOCK_MINUTES = 5;

function customSite(domain) {
  return { id: `custom:${domain}`, label: domain, domains: [domain] };
}

function allSites(settings) {
  return [
    ...Object.entries(BLOCKABLE_SITES).map(([id, site]) => ({ id, ...site })),
    ...settings.siteBlock.custom.map(customSite)
  ];
}

// Whether or not blocking is actually switched on
function chosenSites(settings) {
  return allSites(settings).filter((site) => !settings.siteBlock.excluded.includes(site.id));
}

function isBlockingOn(settings) {
  return settings.studyMode && settings.siteBlock.enabled;
}

function siteForHost(sites, hostname) {
  return sites.find((site) =>
    site.domains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`))
  );
}

function originPattern(domain) {
  return `*://*.${domain}/*`;
}

// "https://www.Reddit.com/r/all" -> "reddit.com", or null if it isn't a website
function normalizeDomain(input) {
  let host;
  try {
    const raw = input.trim().toLowerCase();
    host = new URL(raw.includes("://") ? raw : `https://${raw}`).hostname;
  } catch {
    return null;
  }
  host = host.replace(/^www\./, "");
  return /^([a-z0-9-]+\.)+[a-z]{2,}$/.test(host) ? host : null;
}
