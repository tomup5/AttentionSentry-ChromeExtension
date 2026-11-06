// Sites Attention Guard can block, shared by the popup, the background worker, and the blocked page.
// Each site lists every domain it's served from; subdomains are covered automatically.

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

// How long "Open anyway" / "Open for 5 minutes" lets a blocked site through.
const UNLOCK_MINUTES = 5;

function customSite(domain) {
  return { id: `custom:${domain}`, label: domain, domains: [domain] };
}

// Every built-in site plus the user's own, checked or not.
function allSites(settings) {
  return [
    ...Object.entries(BLOCKABLE_SITES).map(([id, site]) => ({ id, ...site })),
    ...settings.siteBlock.custom.map(customSite)
  ];
}

// The sites the user has chosen to block, whether or not blocking is switched on.
function chosenSites(settings) {
  return allSites(settings).filter((site) => !settings.siteBlock.excluded.includes(site.id));
}

function isBlockingOn(settings) {
  return settings.studyMode && settings.siteBlock.enabled;
}

// The site in `sites` that serves `hostname`, if any.
function siteForHost(sites, hostname) {
  return sites.find((site) =>
    site.domains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`))
  );
}

// Host permission pattern covering a domain and its subdomains.
function originPattern(domain) {
  return `*://*.${domain}/*`;
}

// Turn what the user typed ("https://www.Reddit.com/r/all") into a bare domain
// ("reddit.com"), or null if it isn't a website address.
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
