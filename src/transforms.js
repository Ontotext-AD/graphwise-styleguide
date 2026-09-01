/**
 * Custom Style Dictionary transforms.
 *
 * Some built-in Style Dictionary transforms misbehave with our tokens. Registering a
 * transform under an existing built-in name does NOT override it, so instead every fix
 * is registered under its own `gw/` name and swapped into the platform's transform list
 * by `registerCustomTransforms`.
 *
 * To add another fix: write a `registerX(sd)` function that registers the transform and
 * returns a `[builtinName, customName]` pair, then add it to `TRANSFORM_OVERRIDES`.
 */

const SIZE_REM = 'size/rem';
const SIZE_REM_MULTI_VALUE = 'gw/size/rem';

/**
 * Splits a CSS value on its top-level whitespace, leaving whitespace inside functions
 * such as `calc(2rem + 1px)` alone.
 *
 * @param {string} value
 * @returns {string[]}
 */
function splitTopLevel(value) {
  const parts = [];
  let current = '';
  let depth = 0;

  for (const char of value.trim()) {
    if (char === '(') depth += 1;
    if (char === ')') depth -= 1;

    if (depth === 0 && /\s/.test(char)) {
      if (current) parts.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  if (current) parts.push(current);

  return parts;
}

/**
 * Style Dictionary's built-in `size/rem` transform cannot handle multi-value dimensions
 * such as "0.5rem 0.75rem". Its `getTokenDimensionValue` helper only looks at the unit at
 * the very end of the string, strips the first occurrence of it and re-appends it to the
 * whole value, so "0.5rem 0.75rem" becomes "0.5 0.75remrem". Values without a trailing
 * unit fare even worse: "0.5rem 0 0 0" is collapsed to "0.5rem".
 *
 * The wrapper below applies the built-in transform to each top-level part on its own.
 * A part the built-in cannot parse (e.g. the `auto` of "0 auto") is passed through
 * untouched, which is how the built-in used to treat such values as a whole.
 *
 * @param {import('style-dictionary').default} sd
 * @returns {[string, string]} the built-in transform name and its replacement
 */
function registerMultiValueSizeRem(sd) {
  const builtin = sd.hooks.transforms[SIZE_REM];
  if (!builtin) {
    throw new Error(`Cannot wrap the '${SIZE_REM}' transform: it is not registered.`);
  }

  sd.registerTransform({
    ...builtin,
    name: SIZE_REM_MULTI_VALUE,
    transform: (token, config, options) => {
      const value = options.usesDtcg ? token.$value : token.value;

      if (typeof value !== 'string') {
        return builtin.transform(token, config, options);
      }

      const parts = splitTopLevel(value);
      if (parts.length <= 1) {
        return builtin.transform(token, config, options);
      }

      const valueKey = options.usesDtcg ? '$value' : 'value';
      return parts
        .map((part) => {
          try {
            return builtin.transform({ ...token, [valueKey]: part }, config, options);
          } catch {
            // Not a size the built-in can parse ('auto', 'var(--x)', ...): keep it as is.
            return part;
          }
        })
        .join(' ');
    },
  });

  return [SIZE_REM, SIZE_REM_MULTI_VALUE];
}

const TRANSFORM_OVERRIDES = [
  registerMultiValueSizeRem,
];

/**
 * Registers our custom transforms and returns the transforms of the given transform group
 * with every overridden built-in swapped for its custom replacement.
 *
 * Must be called after `register()` from `@tokens-studio/sd-transforms`, since the group
 * it builds is what we read here.
 *
 * @param {import('style-dictionary').default} sd
 * @param {string} [transformGroup] the transform group to derive the transform list from
 * @returns {string[]} the transform names to use on the platform
 */
export function registerCustomTransforms(sd, transformGroup = 'tokens-studio') {
  const groupTransforms = sd.hooks.transformGroups[transformGroup];
  if (!groupTransforms) {
    throw new Error(
        `Unknown transform group '${transformGroup}'. Has register() from @tokens-studio/sd-transforms been called?`,
    );
  }

  const overrides = new Map(TRANSFORM_OVERRIDES.map((registerTransform) => registerTransform(sd)));

  return groupTransforms.map((name) => overrides.get(name) ?? name);
}
