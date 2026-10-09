import fs from "fs";
import path from "path";
import os from "os";
import { execSync } from "child_process";

// --- Load configuration -------------------------------------------------------
const propsFile = path.join(process.cwd(), "src/config.properties");
if (!fs.existsSync(propsFile)) {
  console.error("❌ Missing src/config.properties file.");
  process.exit(1);
}

const props = Object.fromEntries(
  fs
    .readFileSync(propsFile, "utf8")
    .split(/\r?\n/)
    .filter((line) => line.trim() && !line.startsWith("#"))
    .map((line) => line.split("=").map((p) => p.trim()))
);

const packageName = props.npmPackage;
const localDistDir = path.join(process.cwd(), props.localDistDir || "dist");
const outputDir = path.join(process.cwd(), props.cssVariableComparisonOutputDir || "output");

if (!packageName) {
  console.error("❌ Missing npmPackage in config.properties.");
  process.exit(1);
}

// --- Read local version from package.json -------------------------------------
const pkgJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8"));
const localVersion = pkgJson.version || "local";

// --- Resolve the baseline version to compare against --------------------------
// Usage:
//   --baseline <version>  compare against this exact published version
//   --before <version>    compare against the latest published release lower than <version>
//                         (used by the release docs workflow, where <version> is the one being released)
//   (no args)             compare against the latest published release not newer than package.json,
//                         i.e. the current working copy against what is already released
function getArg(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index !== -1 ? process.argv[index + 1] : undefined;
}

const STABLE_VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

function compareVersions(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

function resolveBaselineVersion() {
  const explicit = getArg("baseline");
  if (explicit) return explicit;

  const before = getArg("before");
  const published = JSON.parse(execSync(`npm view ${packageName} versions --json`, { encoding: "utf8" }))
    .filter((v) => STABLE_VERSION_PATTERN.test(v))
    .sort(compareVersions);

  const candidates = before
    ? published.filter((v) => compareVersions(v, before) < 0)
    : published.filter((v) => !STABLE_VERSION_PATTERN.test(localVersion) || compareVersions(v, localVersion) <= 0);

  if (!candidates.length) {
    console.error(`❌ No published ${packageName} release found to compare against.`);
    process.exit(1);
  }
  return candidates[candidates.length - 1];
}

const packageVersion = resolveBaselineVersion();

// --- Download and extract old package -----------------------------------------
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "token-compare-"));
console.log(`📦 Downloading ${packageName}@${packageVersion} from npm...`);

execSync(`npm pack ${packageName}@${packageVersion}`, { cwd: tempDir, stdio: "ignore" });
const tgzFile = fs.readdirSync(tempDir).find((f) => f.endsWith(".tgz"));
if (!tgzFile) {
  console.error("❌ Could not find downloaded tarball.");
  process.exit(1);
}

const extractDir = path.join(tempDir, "pkg");
fs.mkdirSync(extractDir);
execSync(`tar -xzf ${path.join(tempDir, tgzFile)} -C ${extractDir}`);

const oldDistDir = path.join(extractDir, "package", "dist");
if (!fs.existsSync(oldDistDir)) {
  console.error("❌ Could not find dist/ folder in npm package.");
  process.exit(1);
}

console.log(`✅ Loaded old dist from ${packageName}@${packageVersion}`);

// --- Helper: parse CSS variables ---------------------------------------------
function parseCssVariables(content) {
  const regex = /(--[a-zA-Z0-9-_]+)\s*:\s*([^;]+);/g;
  const result = {};
  let match;
  while ((match = regex.exec(content)) !== null) {
    const [, name, value] = match;
    result[name.trim()] = value.trim();
  }
  return result;
}

// --- Helper: detect renamed variables -----------------------------------------
// CSS variables carry no stable identity, so a rename shows up as one removed and one added
// variable. We treat a removed/added pair as a rename when their names differ in exactly one
// dash-separated segment (e.g. --gw-toast-warn-shadow-blur → --gw-toast-warning-shadow-blur)
// and the match is unambiguous in both directions. Anything else stays Removed/Added.
function differsInOneSegment(a, b) {
  const sa = a.split("-");
  const sb = b.split("-");
  let start = 0;
  while (start < sa.length && start < sb.length && sa[start] === sb[start]) start++;
  let end = 0;
  while (end < sa.length - start && end < sb.length - start && sa[sa.length - 1 - end] === sb[sb.length - 1 - end]) end++;
  return sa.length - start - end === 1 && sb.length - start - end === 1;
}

function detectRenames(removed, added) {
  const candidates = new Map(removed.map((name) => [name, added.filter((n) => differsInOneSegment(name, n))]));
  const timesMatched = new Map();
  candidates.forEach((list) => list.forEach((n) => timesMatched.set(n, (timesMatched.get(n) || 0) + 1)));

  const renames = new Map();
  candidates.forEach((list, name) => {
    if (list.length === 1 && timesMatched.get(list[0]) === 1) {
      renames.set(name, list[0]);
    }
  });
  return renames;
}

// --- Collect theme files ------------------------------------------------------
const localFiles = fs.readdirSync(localDistDir).filter(f => f.startsWith("variables-") && f.endsWith(".css"));
const oldFiles = fs.readdirSync(oldDistDir).filter(f => f.startsWith("variables-") && f.endsWith(".css"));
const allThemes = Array.from(new Set([...localFiles, ...oldFiles]));

if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

// --- Compare and prepare rows -------------------------------------------------
let tableRows = [];
for (const file of allThemes) {
  const localPath = path.join(localDistDir, file);
  const oldPath = path.join(oldDistDir, file);

  if (!fs.existsSync(localPath) && fs.existsSync(oldPath)) {
    const oldVars = parseCssVariables(fs.readFileSync(oldPath, "utf8"));
    for (const [name, oldValue] of Object.entries(oldVars)) {
      tableRows.push({ theme: file, variable: name, status: "Removed", oldValue, newValue: "" });
    }
    continue;
  }

  if (fs.existsSync(localPath) && fs.existsSync(oldPath)) {
    const localVars = parseCssVariables(fs.readFileSync(localPath, "utf8"));
    const oldVars = parseCssVariables(fs.readFileSync(oldPath, "utf8"));

    Object.entries(oldVars).forEach(([name, oldValue]) => {
      if (name in localVars && localVars[name] !== oldValue) {
        tableRows.push({ theme: file, variable: name, status: "Changed", oldValue, newValue: localVars[name] });
      }
    });

    const removed = Object.keys(oldVars).filter((name) => !(name in localVars));
    const added = Object.keys(localVars).filter((name) => !(name in oldVars));
    const renames = detectRenames(removed, added);
    const renamedTo = new Set(renames.values());

    removed.forEach((name) => {
      if (renames.has(name)) {
        const newName = renames.get(name);
        tableRows.push({
          theme: file,
          variable: name,
          newVariable: newName,
          status: "Renamed",
          oldValue: oldVars[name],
          newValue: localVars[newName],
        });
      } else {
        tableRows.push({ theme: file, variable: name, status: "Removed", oldValue: oldVars[name], newValue: "" });
      }
    });
    added
      .filter((name) => !renamedTo.has(name))
      .forEach((name) => {
        tableRows.push({ theme: file, variable: name, status: "Added", oldValue: "", newValue: localVars[name] });
      });
    continue;
  }

  if (fs.existsSync(localPath)) {
    const localVars = parseCssVariables(fs.readFileSync(localPath, "utf8"));
    for (const [name, newValue] of Object.entries(localVars)) {
      tableRows.push({ theme: file, variable: name, status: "Added", oldValue: "", newValue });
    }
  }
}

// --- Generate HTML ------------------------------------------------------------
const humanReadable = new Date().toLocaleString();
const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>CSS Variables Diff Report</title>
<style>
body { font-family: system-ui, sans-serif; background: #fafafa; color: #222; margin: 2rem; }
h1 { font-size: 1.8rem; margin-bottom: 0.5rem; }
p { margin: 0.4rem 0; }
.version-tag {
  display: inline-block; padding: 0.25rem 0.6rem; border-radius: 0.5rem;
  font-weight: 600; font-family: monospace;
}
.local-version { background: #e8f5e9; color: #2e7d32; border: 1px solid #a5d6a7; }
.npm-version { background: #fff3e0; color: #ef6c00; border: 1px solid #ffb74d; }

/* Filters layout (non-sticky) */
.controls {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  margin: 1.5rem 0;
  max-width: 900px;
  padding-top: 0.5rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid #ccc;
}
.filter-block { flex: 1 1 250px; display: flex; flex-direction: column; min-width: 200px; }
label { font-size: 0.9rem; font-weight: 600; color: #444; margin-bottom: 0.25rem; }
input, select { padding: 0.5rem; border-radius: 6px; border: 1px solid #ccc; font-size: 0.95rem; }

/* Table */
table { width: 100%; border-collapse: collapse; margin-top: 1rem; background: white; box-shadow: 0 0 8px rgba(0,0,0,0.05); }
th, td { border: 1px solid #ddd; padding: 0.5rem 0.75rem; text-align: left; font-size: 0.95rem; }
th { background: #f4f4f4; position: sticky; top: 0; z-index: 5; }
tr:nth-child(even) { background: #f9f9f9; }
.Removed { color: #d32f2f; font-weight: 600; }
.Changed { color: #f57c00; font-weight: 600; }
.Added { color: #2e7d32; font-weight: 600; }
.Renamed { color: #1565c0; font-weight: 600; }
.renamed-to { margin-top: 0.2rem; color: #1565c0; }
.name-label { display: inline-block; width: 2.5rem; color: #888; font-size: 0.85rem; }
#countInfo { margin-top: 0.75rem; font-weight: 500; color: #555; }
</style>
</head>
<body>
<h1>🎨 CSS Variables Diff Report</h1>
<p><strong>Generated:</strong> ${humanReadable}</p>
<p><strong>Comparison between:</strong> 
  <span class="version-tag local-version">${packageName}@${localVersion} (local)</span> and 
  <span class="version-tag npm-version">${packageName}@${packageVersion} (npm)</span>
</p>

<div class="controls">
  <div class="filter-block">
    <label for="themeFilter">Theme File</label>
    <select id="themeFilter">
      <option value="">All themes</option>
      ${allThemes.map(theme => `<option value="${theme}">${theme}</option>`).join("")}
    </select>
  </div>
  <div class="filter-block">
    <label for="searchInput">CSS Variable</label>
    <input type="text" id="searchInput" placeholder="🔍 Search variable name..." />
  </div>
  <div class="filter-block">
    <label for="statusFilter">Status</label>
    <select id="statusFilter">
      <option value="">All statuses</option>
      <option value="Removed">Removed</option>
      <option value="Added">Added</option>
      <option value="Renamed">Renamed</option>
      <option value="Changed">Changed</option>
    </select>
  </div>
</div>

<p id="countInfo">Total: ${tableRows.length}</p>

<table id="diffTable">
  <thead>
    <tr>
      <th>Theme</th>
      <th>CSS Variable</th>
      <th>Status</th>
      <th>Old Value</th>
      <th>New Value</th>
    </tr>
  </thead>
  <tbody>
    ${tableRows.map(row => `
      <tr>
        <td>${row.theme}</td>
        <td>${row.newVariable ? `<div><span class="name-label">old:</span> ${row.variable}</div><div class="renamed-to"><span class="name-label">new:</span> ${row.newVariable}</div>` : row.variable}</td>
        <td class="${row.status}">${row.status}</td>
        <td>${row.oldValue}</td>
        <td>${row.newValue}</td>
      </tr>
    `).join("")}
  </tbody>
</table>

<script>
const searchInput = document.getElementById("searchInput");
const themeFilter = document.getElementById("themeFilter");
const statusFilter = document.getElementById("statusFilter");
const table = document.getElementById("diffTable").getElementsByTagName("tbody")[0];
const countInfo = document.getElementById("countInfo");

function filterTable() {
  const query = searchInput.value.toLowerCase();
  const selectedTheme = themeFilter.value;
  const selectedStatus = statusFilter.value;
  let visibleCount = 0;

  for (const row of table.rows) {
    const theme = row.cells[0].innerText;
    const variable = row.cells[1].innerText.toLowerCase();
    const status = row.cells[2].innerText;
    const match = (!query || variable.includes(query)) &&
                  (!selectedTheme || theme === selectedTheme) &&
                  (!selectedStatus || status === selectedStatus);
    row.style.display = match ? "" : "none";
    if (match) visibleCount++;
  }

  countInfo.textContent = "Total: " + visibleCount;
}

searchInput.addEventListener("input", filterTable);
themeFilter.addEventListener("change", filterTable);
statusFilter.addEventListener("change", filterTable);
</script>
</body>
</html>
`;

// --- Write file ---------------------------------------------------------------
const htmlFile = path.join(outputDir, "css-variables-diff.html");
fs.writeFileSync(htmlFile, htmlContent, "utf8");
console.log(`✅ HTML diff report generated: ${htmlFile}`);
