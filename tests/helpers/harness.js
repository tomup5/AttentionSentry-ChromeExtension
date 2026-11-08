// Runs the real scripts in manifest order, only chrome.* is faked. They're classic
// scripts sharing globals so they can't just be imported.

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { JSDOM } = require("jsdom");

const ROOT = path.join(__dirname, "..", "..");
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));

function createEvent() {
  const listeners = [];
  return {
    listeners,
    addListener: (listener) => listeners.push(listener),
    fire: (...args) => listeners.map((listener) => listener(...args))
  };
}

function createStorageArea(name, data, onChanged) {
  return {
    data,
    setAccessLevel: async () => {},
    async get(keys) {
      const result = {};
      for (const key of [].concat(keys ?? Object.keys(data))) {
        if (key in data) result[key] = structuredClone(data[key]);
      }
      return result;
    },
    async set(items) {
      const changes = {};
      for (const [key, value] of Object.entries(items)) {
        data[key] = structuredClone(value);
        changes[key] = { newValue: structuredClone(value) };
      }
      onChanged.fire(changes, name);
    },
    async remove(keys) {
      for (const key of [].concat(keys)) delete data[key];
    }
  };
}

function createChrome({ sync = {}, local = {}, session = {}, granted = [], tabId = 7 } = {}) {
  const onChanged = createEvent();
  const rules = [];
  const sentMessages = [];
  const removedTabs = [];
  return {
    sentMessages,
    removedTabs,
    rules,
    storage: {
      onChanged,
      sync: createStorageArea("sync", sync, onChanged),
      local: createStorageArea("local", local, onChanged),
      session: createStorageArea("session", session, onChanged)
    },
    runtime: {
      id: "test-extension",
      getURL: (file) => `chrome-extension://test-extension/${file}`,
      onMessage: createEvent(),
      onStartup: createEvent(),
      onInstalled: createEvent(),
      async sendMessage(message) {
        sentMessages.push(message);
        return message.type === "getTabId" ? tabId : undefined;
      }
    },
    tabs: {
      onRemoved: createEvent(),
      query: async () => [],
      update: async () => {},
      remove: (id) => removedTabs.push(id)
    },
    alarms: { onAlarm: createEvent(), create: () => {} },
    permissions: {
      onAdded: createEvent(),
      onRemoved: createEvent(),
      contains: async ({ origins }) => origins.every((origin) => granted.includes(origin))
    },
    declarativeNetRequest: {
      getDynamicRules: async () => [...rules],
      async updateDynamicRules({ removeRuleIds, addRules }) {
        for (const id of removeRuleIds) {
          rules.splice(
            rules.findIndex((rule) => rule.id === id),
            1
          );
        }
        rules.push(...addRules);
      }
    }
  };
}

function readSource(file) {
  return fs.readFileSync(path.join(ROOT, file), "utf8");
}

// run() evaluates inside the page, only way to get at top-level consts
function loadScripts(
  files,
  {
    url = "https://example.com/",
    chrome = createChrome(),
    html = "<!doctype html><html><head></head><body></body></html>"
  } = {}
) {
  const dom = new JSDOM(html, {
    url,
    runScripts: "outside-only",
    pretendToBeVisual: true
  });
  const { window } = dom;
  window.chrome = chrome;
  window.matchMedia = () => ({ matches: false, addEventListener() {} });
  const context = dom.getInternalVMContext();
  for (const file of files) vm.runInContext(readSource(file), context, { filename: file });
  return {
    window,
    document: window.document,
    chrome,
    run: (code) => vm.runInContext(code, context),
    close: () => window.close()
  };
}

function loadPage(htmlFile, options = {}) {
  const html = readSource(htmlFile);
  const files = [...html.matchAll(/<script src="([^"]+)"/g)].map(([, src]) =>
    path.posix.join(path.posix.dirname(htmlFile), src)
  );
  return loadScripts(files, { ...options, html });
}

function siteScripts(site) {
  const entry = manifest.content_scripts.find((c) => c.js.includes(`content/${site}.js`));
  if (!entry) throw new Error(`No content script for ${site}`);
  return entry.js;
}

// Let chrome.* promises and zero-delay timers settle
async function flush() {
  for (let i = 0; i < 3; i++) await new Promise((resolve) => setTimeout(resolve, 0));
}

function activeSettings(overrides = {}) {
  return { studyMode: true, ...overrides };
}

async function loadSite(site, { url, settings = activeSettings(), local, session } = {}) {
  const chrome = createChrome({ sync: { settings }, local, session });
  const page = loadScripts(siteScripts(site), { url, chrome });
  await flush();
  return page;
}

async function startCoreSite({
  site = "reddit",
  url,
  settings = activeSettings(),
  hooks = {}
} = {}) {
  const chrome = createChrome({ sync: { settings } });
  const page = loadScripts(
    siteScripts(site).filter((file) => file !== `content/${site}.js`),
    { url, chrome }
  );
  page.window.testHooks = hooks;
  page.run(`startSite({ site: ${JSON.stringify(site)}, applyClasses() {}, ...testHooks })`);
  await flush();
  return page;
}

// Worker scope with importScripts, same as Chrome
async function loadWorker({ chrome = createChrome() } = {}) {
  const context = vm.createContext({ chrome, console, URL, setTimeout });
  context.importScripts = (...files) => {
    for (const file of files) vm.runInContext(readSource(file), context, { filename: file });
  };
  vm.runInContext(readSource(manifest.background.service_worker), context, {
    filename: manifest.background.service_worker
  });
  return { chrome, run: (code) => vm.runInContext(code, context) };
}

// Objects from another realm fail deepStrictEqual on their prototype
const plain = (value) => JSON.parse(JSON.stringify(value));

module.exports = {
  ROOT,
  manifest,
  activeSettings,
  createChrome,
  flush,
  loadPage,
  loadScripts,
  loadSite,
  loadWorker,
  plain,
  siteScripts,
  startCoreSite
};
