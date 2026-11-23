import {cpSync, chmodSync} from 'fs';

cpSync('src/purge-css', 'dist/purge-css', { recursive: true });
// Make the bins executable
['gw-purge-css.js', 'gw-check-deprecated.js'].forEach((bin) => {
  cpSync(`src/${bin}`, `dist/${bin}`);
  chmodSync(`dist/${bin}`, 0o755);
});
