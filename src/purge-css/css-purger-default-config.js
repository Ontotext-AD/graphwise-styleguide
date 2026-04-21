/**
 * @fileoverview Configuration options for the CSS Variable Purger
 */

/**
 * Default configuration for CSS variable purging
 * @typedef {Object} CSSPurgerConfig
 * @property {string[]} safelist - CSS variables to always keep, regardless of usage
 * @property {RegExp[]} safelistPatterns - Regex patterns for CSS variable families to keep
 * @property {boolean} debug - Enable detailed logging output
 * @property {boolean} includeStringReferences - Include CSS variables found in string literals
 * @property {boolean} includeDependencies - Include variables that are dependencies of used variables
 */

/**
 * Default configuration for the CSS Variable Purger
 * @type {CSSPurgerConfig}
 */
export const DEFAULT_CONFIG = {
  // Variables to always preserve
  safelist: [],

  // Regex patterns for variable families to preserve
  safelistPatterns: [],

  // Processing options
  debug: false,
  includeStringReferences: true,
  includeDependencies: true,
};
