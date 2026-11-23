#!/usr/bin/env node

// Prints the deprecated graphwise-styleguide CSS variables the application uses, with their replacements.
//
// Usage:
//   gw-check-deprecated [--fail] [--configFile <file>] [<glob>...]
//
//   <glob>...            the files to scan. Without them, the searchPaths and ignorePaths of the config file are used.
//   --configFile <file>  the gw-purge-css config file, purge-css-config.json by default
//   --fail               exit with an error when a deprecated variable is used (e.g. in CI)

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { checkDeprecatedUsages } from './purge-css/deprecated-usages.js';

const args = process.argv.slice(2);
const fail = args.includes('--fail');
const configIndex = args.indexOf('--configFile');
const configFile = configIndex !== -1 ? args[configIndex + 1] : 'purge-css-config.json';
const globs = args.filter((arg, i) => !arg.startsWith('--') && (configIndex === -1 || i !== configIndex + 1));

let searchPaths = globs;
let ignorePaths = ['**/node_modules/**'];
if (!searchPaths.length) {
  if (!configFile || !fs.existsSync(configFile)) {
    console.error(
      'Pass the files to scan as glob patterns, or a gw-purge-css config file with searchPaths ' +
        '(purge-css-config.json or --configFile <file>).'
    );
    process.exit(1);
  }
  const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
  if (!config.searchPaths) {
    console.error(`Configuration property "searchPaths" is missing in ${configFile}.`);
    process.exit(1);
  }
  searchPaths = config.searchPaths;
  ignorePaths = config.ignorePaths || ignorePaths;
}

// This file is in the styleguide dist/, next to the deprecated-variables-*.json files.
const distDir = path.dirname(fileURLToPath(import.meta.url));
const usages = checkDeprecatedUsages(distDir, searchPaths, ignorePaths);
if (!usages.length) {
  console.log('✅ No deprecated graphwise-styleguide variables are used.');
} else if (fail) {
  process.exit(1);
}
