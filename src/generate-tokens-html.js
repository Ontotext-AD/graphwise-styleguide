import fs from "fs";
import path from "path";
import tokens from "../tokens/tokens.json" with { type: "json" };

// --- Helpers ---------------------------------------------------------

function normalizePath(str) {
  return str
    .toLowerCase()
    .replace(/[,\/\s_]+/g, ".")
    .replace(/\.{2,}/g, ".")
    .replace(/(^\.|\.$)/g, "");
}

function extractTokens(obj, prefix = [], result = {}) {
  for (const [key, value] of Object.entries(obj)) {
    const cleanKey = normalizePath(key);
    if (value && typeof value === "object" && "$type" in value && "$value" in value) {
      const type = value.$type;
      const varPath = prefix.slice(1).concat(cleanKey);
      const cssVar = `--gw-${varPath.join("-").replace(/[,\s\/._]+/g, "-").toLowerCase()}`;
      if (!result[type]) result[type] = [];
      result[type].push({
        name: varPath.join("."),
        value: value.$value,
        type,
        cssVar,
      });
    } else if (value && typeof value === "object") {
      extractTokens(value, prefix.concat(cleanKey), result);
    }
  }
  return result;
}

function flattenTokens(obj, prefix = [], result = {}) {
  for (const [key, value] of Object.entries(obj)) {
    const cleanKey = normalizePath(key);
    if (value && typeof value === "object" && "$value" in value) {
      const name = normalizePath(prefix.concat(cleanKey).join("."));
      result[name] = value.$value;
    } else if (typeof value === "object") {
      flattenTokens(value, prefix.concat(cleanKey), result);
    }
  }
  return result;
}

const allTokens = extractTokens(tokens);
const flatTokens = flattenTokens(tokens);
const topNamespaces = Object.keys(tokens).map((k) => normalizePath(k));

// --- Expression Resolver ---------------------------------------------

function resolveValue(val, seen = new Set()) {
  if (typeof val !== "string") {
    if (Array.isArray(val)) return JSON.stringify(val);
    if (typeof val === "object" && val !== null)
      return `<pre>${JSON.stringify(val, null, 2)}</pre>`;
    return String(val);
  }

  // Resolve all {ref} in string
  let resolved = val;
  const refRegex = /{([^}]+)}/g;
  resolved = resolved.replace(refRegex, (_, innerRef) => {
    const ref = normalizePath(innerRef);
    const tryKeys = [ref, ...topNamespaces.map((ns) => `${ns}.${ref}`)];
    for (const key of tryKeys) {
      if (flatTokens[key]) return resolveValue(flatTokens[key], seen);
    }
    return "[missing reference]";
  });

  // Handle concatenation (e.g. "0.5rem 1rem")
  if (resolved.includes(" ") && !resolved.includes("/") && !resolved.includes("*") && !resolved.includes("+") && !resolved.includes("- ")) {
    return resolved;
  }

  // Handle math with multiple references (like "2rem - 1rem")
  const mathPattern = /^([\d.]+)([a-z%]+)?\s*([*/+\-])\s*([\d.]+)([a-z%]+)?$/i;
  const m = resolved.match(mathPattern);
  if (m) {
    const [, num1, unit1 = "", op, num2, unit2 = ""] = m;
    const a = parseFloat(num1);
    const b = parseFloat(num2);
    if (!isNaN(a) && !isNaN(b)) {
      let result = a;
      switch (op) {
        case "/": result = a / b; break;
        case "*": result = a * b; break;
        case "+": result = a + b; break;
        case "-": result = a - b; break;
      }
      const unit = unit1 || unit2;
      return result + unit;
    }
  }

  return resolved;
}

// --- HTML Output ------------------------------------------------------

const sidebar = Object.keys(allTokens)
  .map(
    (type) =>
      `<li><a href="#${type}">${type.charAt(0).toUpperCase() + type.slice(1)} <span style="color:#888">(${allTokens[type].length})</span></a></li>`
  )
  .join("");

const tables = Object.entries(allTokens)
  .map(
    ([type, tokens]) => `
  <section id="${type}">
    <h2>${type.charAt(0).toUpperCase() + type.slice(1)} Tokens</h2>
    <table class="token-table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Value</th>
          <th>CSS Variable</th>
          <th>Calculated Value</th>
        </tr>
      </thead>
      <tbody>
        ${tokens
      .map((token) => {
        const resolved = resolveValue(token.value);
        const isError = typeof resolved === "string" && resolved.startsWith("[");
        return `
          <tr>
            <td>${token.name}</td>
            <td>${typeof token.value === "object" ? `<pre>${JSON.stringify(token.value, null, 2)}</pre>` : token.value}</td>
            <td class="css-var">${token.cssVar}</td>
            <td class="${isError ? "error" : ""}">
              ${
          token.type === "color" && !isError && typeof resolved === "string"
            ? `<span class="swatch" style="background:${resolved}"></span> ${resolved}`
            : resolved
        }
            </td>
          </tr>`;
      })
      .join("")}
      </tbody>
    </table>
  </section>
`
  )
  .join("");

// --- Write HTML ------------------------------------------------------

const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Design Tokens Browser</title>
<style>
  body { font-family: sans-serif; margin: 0; }
  nav { position: fixed; top: 0; left: 0; width: 220px; height: 100vh; background: #f7f8fa; padding: 2rem 1rem; overflow-y: auto; border-right: 1px solid #eee; z-index: 2; }
  main { margin-left: 220px; padding: 2rem; }
  nav ul { list-style: none; padding: 0; }
  nav li { margin-bottom: 1rem; }
  nav a { text-decoration: none; color: #222; font-weight: 500; }
  table { border-collapse: collapse; width: 100%; margin-bottom: 2rem; }
  th, td { border: 1px solid #eee; padding: 0.5rem; text-align: left; vertical-align: top; }
  thead th { position: sticky; top: 60px; background: #fff; z-index: 1; }
  .swatch { width: 24px; height: 24px; display: inline-block; border-radius: 4px; border: 1px solid #ccc; vertical-align: middle; margin-right: 8px; }
  .css-var { font-family: monospace; color: #888; }
  td.error { color: #d33; font-weight: 500; }
  pre { background: #fafafa; border: 1px solid #eee; padding: 4px 6px; border-radius: 4px; font-size: 12px; margin: 0; overflow-x: auto; }
  #filter-bar { position: sticky; top: 0; background: #fff; padding: 1rem; border-bottom: 1px solid #eee; z-index: 3; }
  #filter-input { width: 100%; padding: 0.5rem; font-size: 1rem; border: 1px solid #ccc; border-radius: 4px; }
</style>
</head>
<body>
  <nav>
    <h1>Design tokens</h1>
    <ul>${sidebar}</ul>
  </nav>
  <main>
    <div id="filter-bar">
      <input id="filter-input" placeholder="🔍 Filter tokens by name..." />
    </div>
    ${tables}
  </main>

<script>
  // Filter by token name
  const input = document.getElementById('filter-input');
  input.addEventListener('input', () => {
    const filter = input.value.toLowerCase();
    document.querySelectorAll('tbody tr').forEach(row => {
      const name = row.querySelector('td').textContent.toLowerCase();
      row.style.display = name.includes(filter) ? '' : 'none';
    });
  });
</script>
</body>
</html>
`;

fs.writeFileSync(path.join(process.cwd(), "generated/tokens-browser.html"), html);
console.log("✅ Generated tokens-browser.html with multi-ref, math, filter bar, and sticky headers");
