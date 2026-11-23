/**
 * Finds the deprecated styleguide CSS variables an application uses, so that it can switch to their replacements.
 * Used by the `gw-check-deprecated` bin and by `gw-purge-css`. The deprecated variables come from
 * `dist/deprecated-variables-{light,dark}.json` (see src/deprecated-tokens.js).
 */

/* eslint-env node */

import fs from 'fs';
import path from 'path';
import * as glob from 'glob';

const THEMES = ['light', 'dark'];

/**
 * @typedef {object} DeprecatedUsage
 * @property {string} file the file, relative to the working directory
 * @property {number} line 1-based
 * @property {string} variable the deprecated CSS variable
 * @property {string} replacement the CSS variable to use instead
 */

/**
 * Reads the deprecated variables of the installed styleguide, merged across the themes.
 *
 * @param {string} distDir the styleguide `dist/` directory
 * @returns {{variable: string, replacement: string}[]}
 */
export function readDeprecatedVariables(distDir) {
  const byVariable = new Map();
  THEMES.map((theme) => path.join(distDir, `deprecated-variables-${theme}.json`))
    .filter((file) => fs.existsSync(file))
    .flatMap((file) => JSON.parse(fs.readFileSync(file, 'utf8')))
    .forEach((entry) => byVariable.set(entry.variable, entry));
  return [...byVariable.values()];
}

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Finds the usages of deprecated variables in the given file contents. Any occurrence of the full variable name
 * counts (`var(--x)`, `'--x'`, an override `--x: ...`), but not a longer variable that starts with it.
 *
 * @param {{file: string, content: string}[]} files
 * @param {{variable: string, replacement: string}[]} deprecated
 * @returns {DeprecatedUsage[]} in file and line order
 */
export function findDeprecatedUsages(files, deprecated) {
  if (!deprecated.length) {
    return [];
  }
  const replacements = new Map(deprecated.map((entry) => [entry.variable, entry.replacement]));
  // Longest first, so that a variable that is a prefix of another one does not hide it.
  const names = [...replacements.keys()].sort((a, b) => b.length - a.length).map(escapeRegExp);
  const pattern = new RegExp(`(${names.join('|')})(?![\\w-])`, 'g');

  return files.flatMap(({ file, content }) =>
    content.split(/\r?\n/).flatMap((text, index) =>
      [...text.matchAll(pattern)].map(([variable]) => ({
        file,
        line: index + 1,
        variable,
        replacement: replacements.get(variable),
      }))
    )
  );
}

/**
 * Reads the files that match the glob patterns.
 *
 * @param {string[]} searchPaths glob patterns, relative to the working directory
 * @param {string[]} [ignorePaths] glob patterns to skip
 * @returns {{file: string, content: string}[]}
 */
export function readFiles(searchPaths, ignorePaths = []) {
  const files = new Set(searchPaths.flatMap((pattern) => glob.sync(pattern, { ignore: ignorePaths, nodir: true })));
  return [...files].sort().map((file) => ({ file, content: fs.readFileSync(file, 'utf8') }));
}

/**
 * Prints the usages as warnings.
 *
 * @param {DeprecatedUsage[]} usages
 */
export function printDeprecatedUsages(usages) {
  if (!usages.length) {
    return;
  }
  const variables = new Set(usages.map((usage) => usage.variable));
  console.warn(
    `\n⚠️  ${usages.length} usage(s) of ${variables.size} deprecated graphwise-styleguide variable(s). ` +
      'They will be removed in a later release, switch to the replacements:'
  );
  usages.forEach(({ file, line, variable, replacement }) => {
    console.warn(`  ${file}:${line}  ${variable} → ${replacement}`);
  });
}

/**
 * Finds and prints the deprecated variables used in the files that match the glob patterns.
 *
 * @param {string} distDir the styleguide `dist/` directory
 * @param {string[]} searchPaths
 * @param {string[]} [ignorePaths]
 * @returns {DeprecatedUsage[]}
 */
export function checkDeprecatedUsages(distDir, searchPaths, ignorePaths = []) {
  const usages = findDeprecatedUsages(readFiles(searchPaths, ignorePaths), readDeprecatedVariables(distDir));
  printDeprecatedUsages(usages);
  return usages;
}
