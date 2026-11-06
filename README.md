# Attention Guard

A Chrome extension that calls out the attention-capturing design patterns on YouTube, Reddit, Wikipedia, Discord, and The New York Times (infinite scroll, autoplay, social-proof metrics, link rabbit holes, unread badges, daily games) while you study, and explains each one as it intervenes.

Most focus tools block sites or track screen time. Attention Guard targets the *design* instead: every intervention names the specific pattern it's responding to and cites the HCI research behind it, so users learn to recognize these patterns on their own.

<!-- Add a screenshot or GIF here, e.g. ![Attention Guard overlay on YouTube](docs/screenshot.png) -->

## Features

**YouTube**

| Feature | Pattern addressed | What it does |
|---|---|---|
| **Intention check** | Opening YouTube on autopilot | Asks why you're here when a session starts; your answer stays pinned as a reminder |
| **Hide metrics** | Social proof | Hides view, like, and subscriber counts; optionally blurs thumbnails until hover |
| **Endless-scroll nudge** | Infinite scroll, Shorts | Intervenes after a configurable number of screens scrolled or Shorts watched |
| **Rabbit-hole guard** | Autoplay, recommendations | Turns autoplay off and checks in when you hop from video to video |

**Reddit**

| Feature | Pattern addressed | What it does |
|---|---|---|
| **Intention check** | Opening the feed on autopilot | Asks why you're here on the home, Popular, and All feeds. Opening a community or a post directly goes straight through |
| **Hide metrics** | Social proof | Hides upvotes, comment counts, member counts, and karma |
| **Endless-scroll nudge** | Infinite scroll | Same as YouTube's, for home, Popular, and community feeds |
| **Hide sidebars** | Discovery feeds | Hides Popular, All, Explore, Recent, and the right-hand column |

**Wikipedia**

| Feature | Pattern addressed | What it does |
|---|---|---|
| **Rabbit-hole tracker** | Link hopping | Tracks the trail of links you follow from your starting article and checks in after a set number of hops; a badge links back to where you started |
| **Save tangents** | Unfinished curiosity | Hovering a link offers "Save for later"; saved links are listed in the popup |
| **Hide Main Page extras** | Novelty | Hides Did you know, In the news, On this day, and Random article |

**Discord**

| Feature | Pattern addressed | What it does |
|---|---|---|
| **Study-channel focus** | Always-on chat | Mark the channels you study in; other channels are dimmed and check in when you open them |
| **Hide unread badges** | Notification badges | Hides mention counts and unread dots in the server list |

**The New York Times**

| Feature | Pattern addressed | What it does |
|---|---|---|
| **Intention check** | Opening the front page on autopilot | Asks why you're here on the front page; links straight to an article go through |
| **Games check** | Daily games and streaks | Steps in before Wordle, Connections, Spelling Bee, the Mini, and other games |
| **Article check-in** | Article chains | Checks in once you've read a set number of articles in one session |
| **Hide "More to read"** | Recirculation | Hides Most Popular, Trending, Editors' Picks, and recommended-article boxes |

Each site has its own switch and collapsible section in the popup. Features that hide something do so at every strictness level; check-ins follow the strictness level:

| Mode | Behavior |
|---|---|
| **Hint** | Dismissible toasts that explain the pattern. Nothing is removed. |
| **Pause** | Modal overlays that pause playback, with short countdowns before you can continue. |
| **Block** | Removes the pattern: hides the sidebar, end screens, and Shorts shelves, and stops the feed from loading more. |

The main switch in the popup can always turn Attention Guard off, even in Block mode.

**Distracting-site blocker.** While Attention Guard is on, the sites you pick (TikTok, Instagram, Snapchat, X, Facebook, Tumblr, Twitch, Netflix, Pinterest, plus any you add) open an Attention Guard page instead. The strictness level decides how hard they are to get past: Hint offers an "Open anyway" button, Pause makes you wait 15 seconds first, and Block keeps them closed until Attention Guard is off. An unlocked site stays open for 5 minutes.

The settings page (gear icon in the popup) changes the font and background color used by the popup and every on-page prompt. It offers eight fonts, five color themes plus an automatic light or dark theme (which follows each site's own dark mode), eight accent colors, and three text sizes.

While you study, the popup shows a summary of the current tab's session on a supported site: your stated goal, how many videos or articles you've opened, and how long the tab has been on screen.

## Installation

1. Clone this repository.
2. Open `chrome://extensions` and enable **Developer mode**.
3. Click **Load unpacked** and select the project folder.
4. Open the extension popup, turn on Attention Guard, and visit one of the supported sites.

## Architecture

Manifest V3 with no build step and no dependencies.

```
 Popup ──writes──► chrome.storage.sync ──onChanged──► Content scripts (one per site)
                                                              │
 Background worker ◄──────────── "closeTab" message ──────────┘
```

- **`popup/`**: settings UI. Writes settings to `chrome.storage.sync`; it never messages the page directly. The per-site sections are built from `SITE_SECTIONS` in `popup.js`, and which ones are expanded is remembered in `chrome.storage.local`.
- **`content/`**: injected into each supported site. Listens for storage changes so settings apply live without a reload.
  - `ui.js` and `ui.css` are a small site-agnostic toolkit for toasts and modal overlays.
  - `common.js` holds what every site shares: per-tab session state (one slot per site), the intention check and goal badge, the endless-scroll nudge, time tracking, and `startSite()`, which each site script calls once.
  - `techniques.js` holds the copy and citations for each design pattern.
  - `youtube.js`, `reddit.js`, `wikipedia.js`, `discord.js`, and `nyt.js` contain each site's feature logic, with a matching `.css` file for the hiding. Rules are scoped to classes toggled on `<html>`, so they also apply to content the site renders later. Single-page apps (YouTube, Reddit, Discord, NYT Games) are followed by polling the URL.
  - YouTube card metadata ("1.2M views") and NYT "More to read" boxes are matched by text through a `MutationObserver`, because their class names change. Reddit's counts render partly inside shadow DOM, so `reddit.js` adds a style to each shadow root. Discord's class names are generated per build, so `discord.css` matches data attributes and class-name prefixes.
- **`shared/settings.js`**: the settings schema and defaults, loaded by the popup, the content scripts, the background worker, and the blocked page.
- **`shared/appearance.js`**: font and color themes for the popup and the on-page UI. Fonts are bundled in `fonts/` (SIL Open Font License, see `fonts/licenses/`) instead of loaded from a CDN, so the extension makes no network requests.
- **`shared/sites.js`**: the list of blockable sites and helpers for matching and validating domains.
- **`background.js`**: closes the tab on request and gives content scripts their tab ID, which keys per-tab session state. It also turns the site-blocking settings into `declarativeNetRequest` rules: sites the user granted access to are redirected to `blocked/`, the rest get Chrome's plain block page. Temporary unlocks live in `chrome.storage.session` and end with a `chrome.alarms` alarm.
- **`blocked/`**: the page shown in place of a blocked site. It reuses the overlay card from `content/ui.js`.

These sites change their markup regularly. Selectors each script depends on are kept in `SELECTORS` at the top of the site's `.js` file, and selectors used only for hiding live in its `.css` file.

## Privacy

Attention Guard makes no network requests and collects no data. Its scripts run only on YouTube, Reddit, Wikipedia, Discord, and nytimes.com. Site blocking uses `declarativeNetRequest`, so Chrome does the blocking without the extension reading those pages; access to the blocked sites is optional and requested only for the sites you choose. Settings live in `chrome.storage.sync`. Per-tab session state (your stated intention, videos and articles opened, your Wikipedia trail) lives in `chrome.storage.session`, not the page's `sessionStorage`, so the sites' own scripts can't read it, and it's cleared when the tab closes. Saved Wikipedia links and Discord study channels stay in `chrome.storage.local` on your device. See the full [privacy policy](PRIVACY.md).

## Background

Built for ENGL 4010 at Saint Louis University. The pattern explanations draw on:

- Mildner, T., et al. "About Engaging and Governing Strategies: A Thematic Analysis of Dark Patterns in Social Networking Services." *CHI '23*. https://doi.org/10.1145/3544548.3580695
- Monge Roffarello, A., et al. "Defining and Identifying Attention Capture Deceptive Designs in Digital Interfaces." *CHI '23*. https://doi.org/10.1145/3544548.3580729
- Lydon-Staley, D. M., Zhou, D., Blevins, A. S., Zurn, P., & Bassett, D. S. "Hunters, Busybodies and the Knowledge Network Building Associated with Deprivation Curiosity." *Nature Human Behaviour* 5, 2021.
- Masicampo, E. J., & Baumeister, R. F. "Consider It Done! Plan Making Can Eliminate the Cognitive Effects of Unfulfilled Goals." *Journal of Personality and Social Psychology* 101(4), 2011.
- Zagal, J. P., Björk, S., & Lewis, C. "Dark Patterns in the Design of Games." *Foundations of Digital Games (FDG) 2013*.
- Zhao, L. "Social Media Multitasking and College Students' Academic Performance." *Psychology in the Schools* 60(9), 2023. https://doi.org/10.1002/pits.22912

## License

[MIT](LICENSE)
