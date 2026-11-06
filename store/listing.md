# Chrome Web Store submission

Text for the Developer Dashboard fields. Build the upload with `scripts/package.ps1`.

## Store listing

**Name:** Attention Guard

**Summary** (max 132 characters):

> Points out the attention-grabbing tricks websites use while you study.

**Category:** Productivity → Education (or Workflow & Planning)

**Description:**

> Attention Guard helps you stay on task on YouTube, Reddit, Wikipedia, Discord, and The New York Times by pointing out the design tricks built to keep you there, and explaining each one as it steps in.
>
> Instead of just blocking sites, every intervention names the pattern it's responding to (infinite scroll, autoplay, vote counts, link rabbit holes, unread badges, daily-game streaks) and cites the research behind it, so you learn to recognize these patterns on your own.
>
> YOUTUBE
> • Intention check: asks why you're opening YouTube and keeps your answer pinned as a reminder
> • Hide metrics: hides view, like, and subscriber counts, with optional thumbnail blur
> • Endless-scroll nudge: steps in after you've scrolled the feed or watched Shorts for a while
> • Rabbit-hole guard: turns off autoplay and checks in when you hop from video to video
>
> REDDIT
> • Intention check on the home and Popular feeds, hidden vote and comment counts, an endless-scroll nudge, and hidden Popular/Explore/Recent sidebars
>
> WIKIPEDIA
> • Rabbit-hole tracker: shows the trail of links you've followed and checks in when you drift from your topic
> • Save tangents: save an interesting link for after you study instead of following it now
>
> DISCORD
> • Study-channel focus: mark your study channels; the rest are dimmed and check in when you open them
> • Hides unread badges on other servers
>
> THE NEW YORK TIMES
> • Steps in before Wordle, Connections, and other games, checks in after several articles, and hides Most Popular and "More to read"
>
> • Distracting-site blocker: keeps TikTok, Instagram, Snapchat, X, Facebook, Tumblr, Twitch, Netflix, Pinterest, and any sites you add closed while you study
>
> THREE STRICTNESS LEVELS
> • Hint: dismissible messages that explain the pattern
> • Pause: overlays with short countdowns before you can continue
> • Block: removes the sidebar, end screens, and Shorts, and stops the feed from loading more
>
> PRIVACY
> No accounts, no analytics, no network requests. Everything stays in your browser.

**Assets you need to provide:**

- Store icon: `icons/icon128.png`
- At least one screenshot, 1280×800 or 640×400 (PNG or JPEG)
- Small promo tile, 440×280

## Privacy practices tab

**Single purpose:**

> Reduces distraction while studying: on YouTube, Reddit, Wikipedia, Discord, and The New York Times by hiding engagement metrics and recommendations, limiting autoplay, endless feeds, and link rabbit holes, and explaining the attention-capturing design patterns it intervenes on; elsewhere by blocking the social media and streaming sites the user chooses while Attention Guard is on.

**Permission justifications:**

| Permission | Justification |
|---|---|
| `storage` | Saves the user's settings, a flag for a one-time explanation message, and per-tab session state (the user's stated reason for visiting, which videos they've opened, and time spent, used for reminders and the session summary). Session state is cleared when the tab closes. |
| Host permissions `https://www.youtube.com/*`, `https://www.reddit.com/*`, `https://old.reddit.com/*`, `https://*.wikipedia.org/*`, `https://discord.com/*`, `https://www.nytimes.com/*` | Content scripts run only on these sites to hide engagement counts, recommendation modules, and unread badges, show reminder overlays, and (on YouTube) turn off autoplay. They do not run on any other site. |
| `declarativeNetRequest` | Blocks main-frame loads of the sites the user chose to block, only while Attention Guard and site blocking are on. Rules are built from the user's list; no browsing data is read or stored. |
| `alarms` | Ends a temporary unlock: when a user opens a blocked site for 5 minutes, an alarm re-blocks it afterwards. |
| Optional host permissions `*://*/*` | Requested at runtime only for the specific sites the user chooses to block. Needed to redirect those sites to the extension's "blocked" page (instead of Chrome's error page) and to move already-open tabs on them there. No content scripts run on these sites. |

**Remote code:** No, I am not using remote code. All JavaScript is packaged with the extension.

**Data usage:** The extension stores data locally to provide its features but does not collect or transmit it. If the dashboard asks per category:

- **Website content**: checked. The extension reads text on the supported sites (such as "1.2M views" on YouTube, module headings on nytimes.com, and the channel name in Discord's tab title) to decide what to hide or when to check in. Processed locally, never transmitted. Titles of Wikipedia links the user saves and names of Discord channels the user marks are stored locally only.
- **Personally identifiable information, health, financial, authentication, personal communications, location, web history, user activity**: not collected.

Certify all three statements:

- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

**Privacy policy URL:** link to `PRIVACY.md` in the GitHub repository, e.g. `https://github.com/<username>/attention-guard/blob/main/PRIVACY.md`.
