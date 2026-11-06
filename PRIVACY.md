# Privacy Policy

_Last updated: November 5, 2026_

Attention Guard does not collect, transmit, sell, or share any personal data. It makes no network requests, and there are no analytics, tracking, or third-party services.

## Data stored on your device

Attention Guard stores a small amount of data using Chrome's extension storage. None of it leaves your browser except through Chrome's own sync, described below.

| Data | Where it's stored | How long it's kept |
|---|---|---|
| Your settings (which features are on, strictness mode, scroll threshold, appearance, and which sites to block, including any you added) | `chrome.storage.sync`, which Chrome syncs across browsers signed in to your Google account if you have sync turned on | Until you uninstall the extension |
| Whether each one-time explanation message has been shown, and which popup sections you left expanded | `chrome.storage.local`, on this device only | Until you uninstall the extension |
| Wikipedia links you saved for later (each link's title and address, and the article you were reading when you saved it) | `chrome.storage.local`, on this device only | Until you remove them in the popup, or uninstall the extension |
| Discord channels you marked as study channels (the server and channel IDs and names) | `chrome.storage.local`, on this device only | Until you remove them in the popup or Discord, or uninstall the extension |
| Per tab and per site: your answer to the intention check (the reason you picked and any note you typed), how long the tab has been on screen with Attention Guard on, the IDs of YouTube videos and addresses of New York Times articles opened, the Wikipedia articles you followed links through, and which Discord channels and NYT games you chose to continue into | `chrome.storage.session`, in memory only | Deleted when the tab closes, and always when the browser closes |
| Which blocked sites you've opened for a few minutes, and when that ends | `chrome.storage.session`, in memory only | Deleted when the time runs out, and always when the browser closes |

This data is only accessible to the extension. It is not readable by YouTube, Reddit, Wikipedia, Discord, The New York Times, or any other website. The extension reads page content on those sites only to decide what to hide or when to check in (for example, the heading of a "Most Popular" box, or the channel name in Discord's tab title), and never stores or sends message contents or other page text.

## Permissions

- **`storage`**: saves the data listed above.
- **Access to `www.youtube.com`, `www.reddit.com` and `old.reddit.com`, `*.wikipedia.org`, `discord.com`, and `www.nytimes.com`**: lets the extension show its prompts and hide counts, recommendations, and badges on those sites, and turn off autoplay on YouTube. It does not run scripts on any other site.
- **`declarativeNetRequest`**: blocks the sites you chose while Attention Guard is on. Chrome applies the blocking rules itself; the extension does not see your browsing or the content of those sites.
- **`alarms`**: re-blocks a site when the few minutes you opened it for are up.
- **Optional access to the sites you block**: only requested when you turn on site blocking or add a site, and only for those sites. It lets the extension show its own "blocked" page instead of Chrome's error page, and move tabs already open on those sites to it. If you decline, the sites are still blocked.

## Changes

If this policy changes, the updated version will be posted here with a new date.

## Contact

Questions about this policy can be sent through the project's GitHub issues page.
