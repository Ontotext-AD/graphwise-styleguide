# Graphwise Styleguide

Design tokens (exported from Figma by Tokens Studio) built into CSS variables for all Graphwise applications, published
to npm as `graphwise-styleguide`. The process from Figma to release is in README.md → Usage.

## Tokens

- `tokens/tokens.json` is the designer's Tokens Studio export. It arrives through the `gw-theme` branch and reaches
  `master` only via `npm run sync-tokens`, which keeps the `Gw-Theme-Commit` trailers that mark what is synced.
  Treat it as generated input: fix token problems in the build (`src/transforms.js`, `src/preprocessors.js`).
- `gw-theme` holds only token commits and is intentionally behind `master` in code; build and test on a branch from
  `master`.

## Build

- `src/index.js` splits the tokens into `modes/{light,dark}-mode-tokens.json` and builds `dist/variables-light.css`
  (`:root`) and `dist/variables-dark.css` (`:root.dark`), prefix `gw`, skipping `figma` tokens.
- `src/transforms.js` replaces built-in `@tokens-studio/sd-transforms` transforms that produce wrong CSS; read its
  comments before changing transforms.
- The build exits non-zero on invalid tokens and broken references (`brokenReferences: 'throw'`); a release depends on
  that, so keep it failing loudly.
- `dist/`, `modes/` and `generated/` are build outputs (gitignored). `dist/` is the npm package, including the
  `gw-purge-css` bin the applications run, so changes under `src/purge-css/` affect consumers.

## Environment

- Node comes from nvm (`.nvmrc`); load it before running npm in a fresh shell:
  `. "$HOME/.nvm/nvm.sh" && nvm use`.
- `npm run lint` is currently broken: `eslint.config.js` is CommonJS in an ESM package.

## Release

- Releases run in Jenkins (`JenkinsfileRelease`): version, build, commit `Release X.Y.Z`, tag `vX.Y.Z`, push, npm publish.
- A `v*.*.*` tag triggers `.github/workflows/publish-tokens-docs.yml`, which publishes the tokens browser and the CSS
  variables diff against the previous release to GitHub Pages, keeping a snapshot per version.

## Conventions

- Commit and PR titles start with the Jira key: `GDB-12345 <summary>`. Token updates are titled `DD.MM.YYYY Update tokens`.
