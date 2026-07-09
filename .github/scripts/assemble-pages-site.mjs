import fs from "fs";
import path from "path";

const VERSION = process.env.VERSION;
const GENERATED_DIR = process.env.GENERATED_DIR || "generated";
const PREV_SITE_DIR = process.env.PREV_SITE_DIR || "gh-pages-prev";
const OUT_DIR = process.env.OUT_DIR || "pages-site";

// Restricts VERSION to a safe charset (digits, dots, alphanumeric prerelease suffix) so it
// can't contain path separators/".." (path traversal into OUT_DIR) or HTML-meaningful
// characters (markup injection into the published pages).
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?$/;
// Same shape, prefixed with the "v" used for version snapshot directory names.
const VERSION_DIR_PATTERN = /^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?$/;

if (!VERSION || !VERSION_PATTERN.test(VERSION)) {
  console.error(
    `VERSION env var must be a semantic version like "1.2.3" or "1.2.3-test", got: ${JSON.stringify(VERSION)}`
  );
  process.exit(1);
}

const PAGES = [
  { file: "tokens-browser.html", label: "Tokens Browser", description: "Search and filter all design tokens." },
  { file: "css-variables-diff.html", label: "CSS Variables Diff", description: "Diff report between CSS variables." },
];

fs.rmSync(OUT_DIR, { recursive: true, force: true });
fs.mkdirSync(OUT_DIR, { recursive: true });

// Carry forward previously published version snapshots.
if (fs.existsSync(PREV_SITE_DIR)) {
  for (const entry of fs.readdirSync(PREV_SITE_DIR)) {
    if (VERSION_DIR_PATTERN.test(entry) && fs.statSync(path.join(PREV_SITE_DIR, entry)).isDirectory()) {
      fs.cpSync(path.join(PREV_SITE_DIR, entry), path.join(OUT_DIR, entry), { recursive: true });
    }
  }
}

function landingHtml(version, isLatest) {
  const links = PAGES.map(
    (p) => `<li><a href="${p.file}">${p.label}</a><p>${p.description}</p></li>`
  ).join("\n      ");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Graphwise Styleguide — Design Tokens${isLatest ? "" : ` (${version})`}</title>
<style>
  body { font-family: sans-serif; max-width: 640px; margin: 3rem auto; padding: 0 1rem; color: #222; }
  h1 { margin-bottom: 0; }
  .version { color: #888; margin-top: 0.25rem; }
  ul { list-style: none; padding: 0; }
  li { border: 1px solid #eee; border-radius: 8px; padding: 1rem; margin-bottom: 1rem; }
  li a { font-size: 1.1rem; font-weight: 600; text-decoration: none; color: #0b5fff; }
  li p { margin: 0.4rem 0 0; color: #555; }
</style>
</head>
<body>
  <h1>Graphwise Styleguide</h1>
  <p class="version">Design tokens — ${isLatest ? `latest (${version})` : version}</p>
  <ul>
      ${links}
  </ul>
</body>
</html>
`;
}

function rootIndexHtml(version) {
  const versionDirs = fs
    .readdirSync(OUT_DIR)
    .filter((entry) => VERSION_DIR_PATTERN.test(entry) && fs.statSync(path.join(OUT_DIR, entry)).isDirectory())
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));

  const links = PAGES.map(
    (p) => `<li><a href="${p.file}">${p.label}</a><p>${p.description}</p></li>`
  ).join("\n      ");

  const historyItems = versionDirs
    .map((v) => `<li><a href="${v}/">${v}</a></li>`)
    .join("\n      ");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Graphwise Styleguide — Design Tokens</title>
<style>
  body { font-family: sans-serif; max-width: 640px; margin: 3rem auto; padding: 0 1rem; color: #222; }
  h1 { margin-bottom: 0; }
  .version { color: #888; margin-top: 0.25rem; }
  ul { list-style: none; padding: 0; }
  li { border: 1px solid #eee; border-radius: 8px; padding: 1rem; margin-bottom: 1rem; }
  li a { font-size: 1.1rem; font-weight: 600; text-decoration: none; color: #0b5fff; }
  li p { margin: 0.4rem 0 0; color: #555; }
  h2 { margin-top: 2.5rem; }
  .history { list-style: none; padding: 0; display: flex; flex-wrap: wrap; gap: 0.5rem; }
  .history li { border: none; padding: 0; margin: 0; }
  .history a { display: inline-block; padding: 0.35rem 0.75rem; border: 1px solid #ddd; border-radius: 6px; font-weight: 500; font-size: 0.9rem; }
</style>
</head>
<body>
  <h1>Graphwise Styleguide</h1>
  <p class="version">Design tokens — latest (${version})</p>
  <ul>
      ${links}
  </ul>
  <h2>Version history</h2>
  <ul class="history">
      ${historyItems || "<li>No older versions yet.</li>"}
  </ul>
</body>
</html>
`;
}

// Latest version snapshot.
const versionDir = path.join(OUT_DIR, `v${VERSION}`);
fs.mkdirSync(versionDir, { recursive: true });
for (const p of PAGES) {
  fs.copyFileSync(path.join(GENERATED_DIR, p.file), path.join(versionDir, p.file));
}
fs.writeFileSync(path.join(versionDir, "index.html"), landingHtml(VERSION, false));

// Root = latest version, plus the version history index.
for (const p of PAGES) {
  fs.copyFileSync(path.join(GENERATED_DIR, p.file), path.join(OUT_DIR, p.file));
}
fs.writeFileSync(path.join(OUT_DIR, "index.html"), rootIndexHtml(VERSION));

console.log(`✅ Assembled Pages site at ${OUT_DIR} (version ${VERSION})`);