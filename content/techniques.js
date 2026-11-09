// The "why" text for each pattern, shown in toasts and overlays.

const TECHNIQUES = {
  intention: {
    name: "Intention check",
    why:
      "Half the time you're on here because they trained your hands to open it. " +
      "Say why you came so it's actually your call.",
    source: "Monge Roffarello et al., CHI 2023"
  },

  socialProof: {
    name: "Social-proof metrics",
    why:
      "YouTube shoves the view count in your face before you've even watched the thing. " +
      "Now you kinda already have an opinion on it.",
    source: "Mildner et al., CHI 2023"
  },

  infiniteScroll: {
    name: "Infinite scroll",
    why:
      "They got rid of the bottom of the page so you'd never hit a stopping point. " +
      "Pretty slick, pretty annoying.",
    source: "Monge Roffarello et al., CHI 2023"
  },

  shorts: {
    name: "Endless short-form feed",
    why: "YouTube made Shorts so easy to swipe that you look up and 20 minutes are gone.",
    source: "Monge Roffarello et al., CHI 2023"
  },

  autoplay: {
    name: "Autoplay",
    why:
      "YouTube just plays the next one unless you stop it, which is a wild default. " +
      "I turned it off, so the next video's up to you.",
    source: "Monge Roffarello et al., CHI 2023"
  },

  recommendations: {
    name: "Recommendation rabbit hole",
    why:
      "'Up next' doesn't care about your midterm. " +
      "YouTube picks whatever's most likely to keep you around.",
    source: "Mildner et al., CHI 2023"
  },

  // Reddit

  votes: {
    name: "Vote and comment counts",
    why:
      "Reddit shows you the score before you read a word, so you end up in the huge threads " +
      "even when some 3-comment post has your answer.",
    source: "Mildner et al., CHI 2023"
  },

  discoveryFeeds: {
    name: "Discovery feeds",
    why: "Popular and Explore are just Reddit trying to get you out of the sub you actually came for.",
    source: "Mildner et al., CHI 2023"
  },

  // Wikipedia

  linkHopping: {
    name: "Link hopping",
    why:
      "Not Wikipedia's fault, every page is just full of links. " +
      "Five clicks later you're reading about Belgian canals and your exam is still on photosynthesis."
  },

  saveForLater: {
    name: "Saving a tangent",
    why: "If it's stuck in your head, save it here and deal with it after. It'll still be there."
  },

  // Discord

  offTopicChat: {
    name: "Always-on chat",
    why:
      "Discord's always got something going on in some channel, " +
      "and every new message is one more reason to hang around.",
    source: "Monge Roffarello et al., CHI 2023"
  },

  unreadBadges: {
    name: "Unread badges",
    why:
      "Those little red numbers are there to bug you until you click. " +
      "Discord knows exactly what it's doing.",
    source: "Monge Roffarello et al., CHI 2023"
  },

  // New York Times

  dailyGames: {
    name: "Daily games and streaks",
    why:
      "The Times gave you a streak so skipping a day feels bad. " +
      "It's a word game, it'll be there after you study."
  },

  recirculation: {
    name: "'More to read' boxes",
    why: "You finish one article and the Times is already waving three more at you.",
    source: "Monge Roffarello et al., CHI 2023"
  },

  articleChain: {
    name: "Article chains",
    why:
      "News sites set it up so one article always leads to another. " +
      "That's how checking the headlines eats an hour.",
    source: "Monge Roffarello et al., CHI 2023"
  }
};
