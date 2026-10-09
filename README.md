# Graphwise Styleguide

Graphwise Styleguide is a comprehensive set of design and coding standards for building consistent, maintainable, 
and scalable user interfaces across Graphwise projects. It provides a way to generate a styleguide stylesheet for 
different applications based on styleguide tokens file prepared by UX designer. 
This ensures a unified look and feel across all Graphwise products.

## Table of Contents

- [Introduction](#introduction)
- [Features](#features)
- [Installation](#installation)
- [Optimize Styleguide](#optimize-styleguide)
- [Usage](#usage)
- [License](#license)

## Introduction

This module serves as the central styleguide for all Graphwise frontend projects. It includes:

- Design tokens for colors, typography, spacing, and more in json format.
- Utility function to generate CSS/SCSS stylesheets from the tokens.
- Documentation and usage examples

## Features

- **Consistent Design Tokens:** Colors, fonts, spacing, and breakpoints.
- **Stylesheet Generation:** Easily generate CSS/SCSS variables from design tokens.
- **Documentation & Usage Examples:** Guidance for integrating tokens and stylesheets.

## Installation

Install via npm:

```bash
npm install graphwise-styleguide
```

## Tokens browser
Tokens file is big and hard to read in raw json format. To make it easier to browse and understand the tokens, you can
run the following command
```bash
npm run generate
```
This will generate `generated/tokens-browser.html` and `generated/css-variables-diff.html`. Open either file in your
browser to view the tokens (or the CSS variables diff report) in a more user-friendly format.

The CSS variables diff compares the locally built `dist/` with a published version of the package and lists the
**Added**, **Changed**, **Removed** and **Renamed** variables. Renamed is a guess: a removed and an added variable whose
names differ in exactly one segment. Run `npm run build` first. By default it compares with the latest release; another
version can be selected:
```bash
npm run compare-css-variables                        # against the latest release
npm run compare-css-variables -- --baseline 1.3.0    # against a specific version
npm run compare-css-variables -- --before 1.3.1      # against the release before 1.3.1
```

A version of this tokens browser is also published automatically to GitHub Pages on every release:
**https://ontotext-ad.github.io/graphwise-styleguide/**

The published site keeps a snapshot per released version under `/vX.Y.Z/`, with the latest version always available at
the root.

## Optimize Styleguide
Graphwise Styleguide provides executable script `gw-purge-css`, which can be used to purge unused variables and generate
light and dark theme CSS files with only the variables used in the application. It requires some configurations
via JSON config file, which should be named `purge-css-config.json` and added at root level 
(next to `package.json`).
### Configuration
| Name                          | Description                                                         | Mandatory | Default value | Example value                                                                           | 
|-------------------------------|---------------------------------------------------------------------|-----------|---------------|-----------------------------------------------------------------------------------------|
| searchPaths                   | Glob patterns for files to scan for CSS variable usage.             | Yes       |               | ["src/\*\*/\*.{html,js,ts,jsx,tsx,scss,css}"]                                           |
| ignorePaths                   | Paths to ignore during file scanning.                               | No        |               | ["\*\*/node_modules/\*\*", "\*\*/dist/\*\*", "\*\*/.git/\*\*", "src/global/theme/\*\*"] |
| lightModeOutputFile           | Path where the purged CSS file for light mode to be generated.      | No        |               | "src/styles/theme/light-mode.css"                                                       |
| darkModeOutputFile            | Path where the purged CSS file for dark mode to be generated.       | No        |               | "src/styles/theme/dark-mode.css"                                                        |
| safelist                      | CSS variables to always keep, regardless of usage.                  | No        | []            |                                                                                         |
| safelistPatterns              | Regex patterns for CSS variable families to keep.                   | No        | []            |                                                                                         |
| debug                         | Enable detailed logging output                                      | No        | false         |                                                                                         |
| includeStringReferences       | Include CSS variables found in string literals                      | No        | true          |                                                                                         |
| includeDependencies           | Include variables that are dependencies of used variables.          | No        | true          |                                                                                         |
| printUndeclaredCSSVariables   | Print variables, which are used but not declared in the styleguide. | No        | false         |                                                                                         |

To use `gw-purge-css` add graphwise-styleguide as dependency. The script can be added to package.json's scripts.   
`--configFile` argument is optional and can be used to override default config file location.
```
"purge-css": "gw-purge-css --configFile ./config/purge-css-config.json"
```  
and then added to the build process. Or run manually with npx:  
```bash
npx gw-purge-css --configFile ./config/purge-css.config.json
```


## Usage

This workflow describes how to update and integrate design tokens and styles from Figma into the styleguide module and 
the application.

### 1. Update in Figma
- A UX expert updates the styleguide and design tokens in Figma.

### 2. Publish Tokens
- A UX expert publishes the updated tokens to this repository in the `gw-theme` branch.
- Each commit must be accompanied by description what is the change in the design included in the coomit.

### 3. Transfer the token changes and test
The `gw-theme` branch contains only the token exports, not the current build scripts, so the changes are tested on a
branch from `master`. A UI developer:
- runs `npm run sync-tokens`. The script creates a `sync-tokens-<date>` branch from `origin/master` and applies, one by one,
  all `gw-theme` commits that changed `tokens/tokens.json` since the last sync (only their `tokens/tokens.json` changes,
  with the original author, date and message). Each commit gets a `Gw-Theme-Commit: <sha>` trailer, which is how the
  next run knows which `gw-theme` commits are already in `master`.
  - On a conflict the script stops and prints what to do; after resolving it, run `npm run sync-tokens -- --continue`.
  - `--from <sha>` overrides the detected last synced `gw-theme` commit.
- executes `npm run build` to generate the theme stylesheets. The build fails on invalid tokens or references to
  missing tokens.
- reviews the changed CSS variables with `npm run compare-css-variables` (see [Tokens browser](#tokens-browser))
- links this npm module with the application where the design system is applied by executing `npm link` in this module
  and `npm link path/to/this/module` in the application's module that depends on this one
- builds and runs the application to verify that all the changes are correct

### 4. Merge to the `master` branch
A UI developer:
- pushes the sync branch and creates a pull request against `master`, e.g. "DD.MM.YYYY Update tokens"
- the pull request is reviewed and merged with **Squash and merge**, keeping the commit messages in the squash commit
  (they contain the `Gw-Theme-Commit` trailers)

### 5. Publish New Package Version
#### With Jenkins (recommended)
A UI developer runs the release job (`JenkinsfileRelease`) with `GIT_BRANCH` (usually `master`) and `RELEASE_VERSION`
(following semantic versioning). The job:
1. sets the version in `package.json` and builds the stylesheets
2. commits `Release X.Y.Z`, creates the `vX.Y.Z` tag and pushes both (atomically)
3. publishes the package to npm
4. sends a Slack notification

The commit and tag are pushed before publishing, because a published npm version cannot be replaced. If the push
fails, nothing is published. If the publish fails after the push, publish manually from the tag (see below, last step).

#### Manually
Requires push rights to `master` and an npm login (`npm login`).
```bash
git switch master && git pull
npm ci
npm version X.Y.Z --no-git-tag-version
npm run build
git commit -am "Release X.Y.Z"
git tag -a vX.Y.Z -m "Release vX.Y.Z"
git push --atomic origin master vX.Y.Z
npm publish
```

In both cases the `vX.Y.Z` tag triggers the GitHub Pages workflow, which publishes the tokens browser and the CSS
variables diff against the previous release.

### 6. Install Updated Styleguide
- A UI developer installs the new styleguide version in the respective Graphwise application by updating its 
`package.json`.

### 7. Optimize Styleguide
The generated stylesheets are large and may contain variables unused in the particular application. To optimize the
styleguide in case for the GraphDB Workbench application, the UI developer runs `npm run build` in the 
`packages/styleguide` module. This runs a custom script that purges unused variables from the generated stylesheets 
based on the actual usage in the application stylesheets. The optimized stylesheets are then are exposed for loading in
the application.

## Notes
- Always follow semantic versioning when publishing updates.
- Ensure that unused variables are purged during the build process for optimal performance.
- Coordinate closely between UX and UI teams for smooth updates.

## License

This project is licensed under the Apache License. See the [LICENSE](LICENSE) file for details.

