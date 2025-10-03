# Graphwise Styleguide

Graphwise Styleguide is a comprehensive set of design and coding standards for building consistent, maintainable, 
and scalable user interfaces across Graphwise projects. It provides a way to generate a styleguide stylesheet for 
different applications based on styleguide tokens file prepared by UX designer. 
This ensures a unified look and feel across all Graphwise products.

## Table of Contents

- [Introduction](#introduction)
- [Features](#features)
- [Installation](#installation)
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

## Usage

This workflow describes how to update and integrate design tokens and styles from Figma into the styleguide module and 
the application.

### 1. Update in Figma
- A UX developer updates the styleguide and design tokens in Figma.

### 2. Publish Tokens
- A UX developer publishes the updated tokens to this repository in the `dev` branch, or exports them as a file and
provides them to the UI developers.

### 3. Update Tokens in Repo
- A UI developer updates the tokens in the styleguide repository with the new version from Figma in case they were 
manually exported from Token Studio in Figma.

### 4. Rebuild Stylesheet
- A UI developer generates the `dist/variables-dark.css` and `dist/variables-light.css` stylesheets by running 
```bash
npm run build
```

### 5. Publish New Package Version
- A UI developer publishes a new version of the styleguide package to NPM, following semantic versioning.

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

