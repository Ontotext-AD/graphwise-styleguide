## GitHub Pages publishing

`.github/workflows/publish-tokens-docs.yml` (with helper `.github/scripts/assemble-pages-site.mjs`) publishes the
`npm run generate` output (tokens browser + CSS variables diff) to GitHub Pages on every `vX.Y.Z` tag push, keeping a
snapshot per version. Do not remove or break this workflow without understanding why it exists — see the "Tokens
browser" section in README.md.

When writing a pull request overview, use the following template:

## What
Describe what changes are introduced with the pull request.

## Why
Describe why the changes are needed.

## How
Describe how the changes are solving the partucular problem.
