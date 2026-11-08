// Explanations of each attention-capturing design pattern, shown in the
// "Why?" line of every toast and overlay.

const TECHNIQUES = {
  intention: {
    name: "Intention check",
    why:
      "Opening a familiar site is often autopilot. " +
      "Saying why you're here gives you a chance to decide.",
    source: "Monge Roffarello et al., CHI 2023"
  },

  socialProof: {
    name: "Social-proof metrics",
    why:
      "View counts, likes, and subscriber numbers shape what you think of a video before you watch it, " +
      "and steer you toward whatever is already popular.",
    source: "Mildner et al., CHI 2023"
  },

  infiniteScroll: {
    name: "Infinite scroll",
    why:
      "This feed has no bottom. With nothing marking the end, " +
      "you never hit a point where stopping feels natural.",
    source: "Monge Roffarello et al., CHI 2023"
  },

  shorts: {
    name: "Endless short-form feed",
    why:
      "Shorts is an endless stack of very short videos. " +
      "Swiping costs nothing, so a few minutes turns into twenty.",
    source: "Monge Roffarello et al., CHI 2023"
  },

  autoplay: {
    name: "Autoplay",
    why:
      "With autoplay, watching more is the default and stopping takes a click. " +
      "It's off now, so the next video is up to you.",
    source: "Monge Roffarello et al., CHI 2023"
  },

  recommendations: {
    name: "Recommendation rabbit hole",
    why:
      "'Up next' is chosen to keep you watching. " + "Every video ends with a link to another one.",
    source: "Mildner et al., CHI 2023"
  },

  // --- Reddit ---

  votes: {
    name: "Vote and comment counts",
    why:
      "Upvotes and comment counts show what's popular before you've read anything, " +
      "which pulls you toward busy threads even when a quiet one has your answer.",
    source: "Mildner et al., CHI 2023"
  },

  discoveryFeeds: {
    name: "Discovery feeds",
    why:
      "Popular, Explore, and 'Recent' exist to show you things you weren't looking for. " +
      "Each one leads out of the community you came to read.",
    source: "Mildner et al., CHI 2023"
  },

  // --- Wikipedia ---

  linkHopping: {
    name: "Link hopping",
    why:
      "Every article is full of links and each one is an easy jump. " +
      "Hop between loosely related pages and you end up with a wide, shallow trail " +
      "when studying needs a deep one."
  },

  saveForLater: {
    name: "Saving a tangent",
    why:
      "An unfinished thought keeps nagging at you. Writing down that you'll " +
      "come back to it is usually enough to let it go for now."
  },

  // --- Discord ---

  offTopicChat: {
    name: "Always-on chat",
    why:
      "A busy channel always has something new in it, " +
      "and each new message is another reason to stay a bit longer.",
    source: "Monge Roffarello et al., CHI 2023"
  },

  unreadBadges: {
    name: "Unread badges",
    why:
      "Red counts and white dots are made to catch the corner of your eye " +
      "and pull you back to servers you weren't using.",
    source: "Monge Roffarello et al., CHI 2023"
  },

  // --- New York Times ---

  dailyGames: {
    name: "Daily games and streaks",
    why:
      "A new puzzle every day and a streak to protect make a game feel like an appointment. " +
      "Missing a day feels like a loss, so 'just one' mid-study is easy to justify."
  },

  recirculation: {
    name: "'More to read' boxes",
    why:
      "Most Popular, Trending, and 'More to read' send you to another article " +
      "as soon as you finish this one, whether or not it's what you came for.",
    source: "Monge Roffarello et al., CHI 2023"
  },

  articleChain: {
    name: "Article chains",
    why:
      "News sites are built so one article leads to the next, " +
      "and a quick look at the headlines can turn into an hour.",
    source: "Monge Roffarello et al., CHI 2023"
  }
};
