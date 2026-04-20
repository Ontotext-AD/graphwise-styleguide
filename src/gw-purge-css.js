#!/usr/bin/env node

import fs from 'fs';
import { purgeCss } from './purge-css/purge-css.js';

const args = process.argv.slice(2);

let configFile;

for (let i = 0; i < args?.length; i++) {
    if (args[i] === '--configFile') {
        i += 1;
        if (args?.length >= i) {
            configFile = args[i];
        }
    }
}

if (!configFile) {
    configFile = 'purge-css-config.json';
}

if (!fs.existsSync(configFile)) {
    console.log('Please provide valid configuration file either at root level with name "purge-css-config.json" or via --configFile argument.');
    process.exit(1);
}

const config = JSON.parse(fs.readFileSync(configFile), "utf8") || {};
void purgeCss(config);
