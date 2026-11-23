/**
 * Deprecated tokens.
 *
 * The designer marks a token as deprecated in Tokens Studio instead of deleting it, with a `$deprecated` property:
 *
 *   "$deprecated": { "severity": "warning", "message": "", "replacementToken": "button.warn.background" }
 *
 * The CSS variable of a deprecated token is still generated, so the applications keep working until they migrate.
 * The build lists the deprecated variables in `dist/deprecated-variables-{light,dark}.json` (part of the npm package),
 * and `npm run compare-css-variables` compares them with the previous release for the release notes.
 */

/**
 * @typedef {object} DeprecatedVariable
 * @property {string} variable the deprecated CSS variable, e.g. "--gw-button-warning-background"
 * @property {string} replacement the CSS variable to use instead, e.g. "--gw-button-warn-background"
 * @property {string} token the deprecated token, e.g. "button.warning.background"
 * @property {string} replacementToken the token to use instead, e.g. "button.warn.background"
 * @property {string} message the designer's message, may be empty
 */

const tokenPath = (token) => token.path.join('.');
const cssVariable = (token) => `--${token.name}`;

/**
 * Lists the deprecated CSS variables and their replacements.
 *
 * Throws when a replacement token does not exist (or is not output as a CSS variable), is deprecated itself, or a
 * deprecated token has no replacement, so that a release never points the applications to a missing variable.
 *
 * @param {object[]} allTokens the transformed tokens of the platform (`sd.getPlatformTokens(...)`)
 * @param {(token: object) => boolean} [isOutput] whether the token is output as a CSS variable (the files filter)
 * @returns {DeprecatedVariable[]} sorted by variable
 */
export function listDeprecatedVariables(allTokens, isOutput = () => true) {
  const tokens = allTokens.filter(isOutput);
  const byPath = new Map(tokens.map((token) => [tokenPath(token), token]));
  const errors = [];
  const deprecated = [];

  tokens
    .filter((token) => token.$deprecated)
    .forEach((token) => {
      const replacementPath = token.$deprecated.replacementToken;
      const replacement = replacementPath && byPath.get(replacementPath);
      if (!replacementPath) {
        errors.push(`${tokenPath(token)} has no replacementToken`);
      } else if (!replacement) {
        errors.push(`${tokenPath(token)} is replaced by ${replacementPath}, which does not exist`);
      } else if (replacement.$deprecated) {
        errors.push(`${tokenPath(token)} is replaced by ${replacementPath}, which is deprecated itself`);
      } else {
        deprecated.push({
          variable: cssVariable(token),
          replacement: cssVariable(replacement),
          token: tokenPath(token),
          replacementToken: replacementPath,
          message: token.$deprecated.message || '',
        });
      }
    });

  if (errors.length) {
    throw new Error(`Invalid deprecated tokens:\n  - ${errors.join('\n  - ')}`);
  }
  return deprecated.sort((a, b) => a.variable.localeCompare(b.variable));
}

/**
 * Compares the deprecated variables of the current build with the ones of the previous release.
 *
 * @param {DeprecatedVariable[]} current
 * @param {DeprecatedVariable[]} previous empty for releases before the deprecated variables were listed
 * @returns {(DeprecatedVariable & {isNew: boolean})[]} the current ones, `isNew` when not deprecated in the previous
 * release
 */
export function compareDeprecatedVariables(current, previous) {
  const before = new Set(previous.map((entry) => entry.variable));
  return current.map((entry) => ({ ...entry, isNew: !before.has(entry.variable) }));
}
