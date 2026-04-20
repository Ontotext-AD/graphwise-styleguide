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
npm run generate-tokens-html
```
This will generate a `tokens-browser.html` file in the root directory of the repository. Open this file in your browser
to view the tokens in a more user-friendly format.

## Optimize Styleguide
Graphwise Styleguide provides executable script `gw-purge-css`, which can be used to purge unused variables and generate
light and dark theme CSS files with only the variables used in the application. It requires some configurations
via JSON config file, which should be named `purge-css-config.json` and added at root level 
(next to `package.json`).
### Configuration
| Name                | Description                                                    | Mandatory | Example value                                                                           | 
|---------------------|----------------------------------------------------------------|-----------|-----------------------------------------------------------------------------------------|
| searchPaths         | Glob patterns for files to scan for CSS variable usage.        | Yes       | ["src/\*\*/\*.{html,js,ts,jsx,tsx,scss,css}"]                                           |
| ignorePaths         | Paths to ignore during file scanning.                          | Yes       | ["\*\*/node_modules/\*\*", "\*\*/dist/\*\*", "\*\*/.git/\*\*", "src/global/theme/\*\*"] |
| lightModeOutputFile | Path where the purged CSS file for light mode to be generated. | No        | "src/styles/theme/light-mode.css"                                                       | 
| darkModeOutputFile  | Path where the purged CSS file for dark mode to be generated.  | No        | "src/styles/theme/dark-mode.css"                                                        | 

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

### 3. Update Tokens in Repo and test
A UI developer: 
- updates its local `gw-theme` branch from the remote git repository
- executes the build script `npm run build` to generate theme stylesheets with variables based on the tokens
- links this npm module with the application where the design system is applied by executing `npm link` in this module and `npm link path/to/this/module` in the application's module that depend on this one.
- Build and run the application to verify that all the changes are correct.

### 4. Transfer changes to the `master` branch
A UI developer:
- creates a branch from the `gw-theme` branch
- increases the package version following semantic versioning
- Rebases the newly created branch onto master. Uses interactive rebase and drops all irrelevant commits. Rebases only the latest, relevant commit/s. Squashes if they are more than one.
- creates a merge request against `master` branch
- the merge request is reviewed and merged

### 5. Publish New Package Version
A UI developer:
- generates the `dist/variables-dark.css` and `dist/variables-light.css` stylesheets by running `npm run build` in the `master` branch 
- publishes a new version of the styleguide package to NPM by executing `npm publish` (requires a login in NPM)

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

