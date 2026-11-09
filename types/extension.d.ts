// Shapes shared across scripts. Only used by npm run typecheck, never shipped.

type Mode = "hint" | "pause" | "block";

interface YouTubeSettings {
  enabled: boolean;
  intention: boolean;
  hideMetrics: boolean;
  blurThumbnails: boolean;
  scrollNudge: boolean;
  scrollScreens: number;
  rabbitHole: boolean;
}

interface RedditSettings {
  enabled: boolean;
  intention: boolean;
  hideMetrics: boolean;
  scrollNudge: boolean;
  scrollScreens: number;
  hideSidebars: boolean;
}

interface WikipediaSettings {
  enabled: boolean;
  rabbitHole: boolean;
  hopLimit: number;
  topicBadge: boolean;
  saveTangents: boolean;
  hideMainPage: boolean;
}

interface DiscordSettings {
  enabled: boolean;
  studyChannels: boolean;
  hideBadges: boolean;
}

interface NytSettings {
  enabled: boolean;
  intention: boolean;
  games: boolean;
  articleCheck: boolean;
  articleLimit: number;
  hideRecirc: boolean;
}

interface SiteBlockSettings {
  enabled: boolean;
  excluded: string[];
  custom: string[];
}

interface AppearanceSettings {
  font: string;
  background: string;
  accent: string;
  textSize: string;
}

interface Settings {
  studyMode: boolean;
  mode: Mode;
  sectionOrder: string[];
  youtube: YouTubeSettings;
  reddit: RedditSettings;
  wikipedia: WikipediaSettings;
  discord: DiscordSettings;
  nyt: NytSettings;
  siteBlock: SiteBlockSettings;
  appearance: AppearanceSettings;
}

interface BlockableSite {
  id: string;
  label: string;
  domains: string[];
}

interface Technique {
  name: string;
  why: string;
  source?: string;
}

interface Intention {
  reason: string;
  label: string;
  note?: string;
}

interface OverlayButton {
  label: string;
  primary?: boolean;
  countdown?: number;
  onClick: (close: () => void) => void;
}

interface OverlayOptions {
  title: string;
  body?: string;
  technique?: Technique;
  content?: Node | null;
  buttons?: OverlayButton[];
  pauseVideos?: boolean;
}

interface Overlay {
  root: HTMLElement;
  close: () => void;
  setButtons: (buttons: OverlayButton[]) => void;
}

interface ToastOptions {
  title: string;
  body?: string | null;
  technique?: Technique | null;
  duration?: number;
}

interface CountCheckIn {
  noun: string;
  count: number;
  technique: Technique;
  onContinue?: () => void;
  pauseVideos?: boolean;
}

interface IntentionReason {
  value: string;
  label: string;
  studying: boolean;
}

interface IntentionConfig {
  siteName: string;
  reasons: IntentionReason[];
  placeholder: string;
  onAccept?: () => void;
}

interface SiteHooks {
  site: string;
  applyClasses: () => void;
  onUrlChange?: () => void;
  checkPage?: () => void;
  onActive?: () => void;
  onInactive?: () => void;
  spa?: boolean;
  navigationEvent?: string;
  isDark?: () => boolean;
}

interface PageObserverOptions {
  throttleMs?: number;
  observe?: MutationObserverInit;
  onStart?: () => void;
}

interface TrailPage {
  title: string;
  url: string;
  hop: number;
}

declare function importScripts(...urls: string[]): void;
