import fs from 'fs';
import path from 'path';
import tokens from '../tokens/tokens.json' with { type: 'json' };

// Recursively extract all tokens, grouped by $type
function extractTokens(obj, prefix = [], result = {}) {
    for (const [key, value] of Object.entries(obj)) {
        if (value && typeof value === 'object' && '$type' in value && '$value' in value) {
            const type = value.$type;
            // Omit the first key (root) from the variable name
            const varPath = prefix.slice(1).concat(key);
            const cssVar = `--gw-${varPath.join('-').replace(/[\s\/]+/g, '-').toLowerCase()}`;
            if (!result[type]) result[type] = [];
            result[type].push({
                name: varPath.join('.'),
                value: value.$value,
                type,
                cssVar
            });
        } else if (value && typeof value === 'object') {
            extractTokens(value, prefix.concat(key), result);
        }
    }
    return result;
}

const allTokens = extractTokens(tokens);

// Generate sidebar and main table
const sidebar = Object.keys(allTokens).map(type =>
  `<li><a href="#${type}">${type.charAt(0).toUpperCase() + type.slice(1)} <span style="color:#888">(${allTokens[type].length})</span></a></li>`
).join('');

const tables = Object.entries(allTokens).map(([type, tokens]) => `
  <section id="${type}">
    <h2>${type.charAt(0).toUpperCase() + type.slice(1)} Tokens</h2>
    <table>
      <thead>
        <tr>
          <th>Name</th>
          <th>Value</th>
          <th>CSS Variable</th>
        </tr>
      </thead>
      <tbody>
        ${tokens.map(token => `
          <tr>
            <td>${token.name}</td>
            <td>
              ${token.type === 'color'
                ? `<span class="swatch" style="background:${token.value}"></span> ${token.value}`
                : `<span>${token.value}</span>`
              }
            </td>
            <td class="css-var">${token.cssVar}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  </section>
`).join('');

const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Design Tokens Browser</title>
<style>
  body { font-family: sans-serif; margin: 0; }
  nav {
    position: fixed;
    top: 0;
    left: 0;
    width: 220px;
    height: 100vh;
    background: #f7f8fa;
    padding: 2rem 1rem;
    overflow-y: auto;
    border-right: 1px solid #eee;
    z-index: 1;
  }
  main {
    margin-left: 220px;
    height: 100vh;
    overflow-y: auto;
    padding: 2rem;
  }
  nav ul { list-style: none; padding: 0; }
  nav li { margin-bottom: 1rem; }
  nav a { text-decoration: none; color: #222; font-weight: 500; }
  table { border-collapse: collapse; width: 100%; margin-bottom: 2rem; }
  th, td { border: 1px solid #eee; padding: 0.5rem; text-align: left; }
  .swatch { width: 24px; height: 24px; display: inline-block; border-radius: 4px; border: 1px solid #ccc; vertical-align: middle; margin-right: 8px; }
  .css-var { font-family: monospace; color: #888; }
  h2 { margin-top: 2rem; }
</style>
</head>
<body>
  <nav>
    <h1>Design tokens</h1>
    <ul>
      ${sidebar}
    </ul>
  </nav>
  <main>
    ${tables}
  </main>
</body>
</html>
`;

fs.writeFileSync(path.join(process.cwd(), 'tokens-browser.html'), html);
console.log('Generated tokens-browser.html');