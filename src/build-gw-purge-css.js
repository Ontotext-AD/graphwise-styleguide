import {cpSync, chmodSync} from 'fs';

cpSync('src/purge-css', 'dist/purge-css', { recursive: true });
cpSync('src/gw-purge-css.js', 'dist/gw-purge-css.js');
// Make it executable
chmodSync('dist/gw-purge-css.js', 0o755);
