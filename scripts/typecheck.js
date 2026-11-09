// Type checks each extension context on its own. Site scripts reuse the same global
// names, so they can't go in one program. File lists come from the manifest and HTML.

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const TSC = path.join(ROOT, "node_modules/typescript/bin/tsc");
const TYPES = "types/extension.d.ts";
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
const manifest = JSON.parse(read("manifest.json"));

function pageScripts(htmlFile) {
  return [...read(htmlFile).matchAll(/<script src="([^"]+)"/g)].map(([, src]) =>
    path.posix.join(path.posix.dirname(htmlFile), src)
  );
}

const worker = manifest.background.service_worker;
const imports = read(worker)
  .match(/importScripts\(([^)]*)\)/)[1]
  .match(/[\w/.-]+\.js/g);

const contexts = {
  background: [...imports, worker],
  popup: pageScripts("popup/popup.html"),
  blocked: pageScripts("blocked/blocked.html")
};
for (const entry of manifest.content_scripts) {
  contexts[path.basename(entry.js.at(-1), ".js")] = entry.js;
}

const flags = [
  "--noEmit",
  "--allowJs",
  "--checkJs",
  "--skipLibCheck",
  "--strict",
  "false",
  "--pretty",
  "false",
  "--target",
  "es2022",
  "--lib",
  "es2022,dom,dom.iterable",
  "--types",
  "chrome"
];

// A shared file is checked in every context that loads it, so report each error once
const errors = new Set();
for (const files of Object.values(contexts)) {
  const { stdout, error } = spawnSync(process.execPath, [TSC, ...flags, TYPES, ...files], {
    cwd: ROOT,
    encoding: "utf8"
  });
  if (error) throw error;
  for (const line of stdout.split(/\r?\n/)) {
    if (/ error TS\d+:/.test(line)) errors.add(line);
  }
}

for (const error of errors) console.error(error);
console.log(`${Object.keys(contexts).length} contexts checked, ${errors.size} type errors`);
process.exit(errors.size ? 1 : 0);
