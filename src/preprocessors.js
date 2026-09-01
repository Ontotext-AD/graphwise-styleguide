/**
 * Custom Style Dictionary preprocessors.
 *
 * To add another one: write a `registerX(sd)` function that registers the preprocessor
 * and returns its name, then add it to `PREPROCESSORS`.
 */

const WRAP_MATH_IN_CALC = 'gw/wrap-math-in-calc';

// A token reference, e.g. "{base.font.size}".
const REFERENCE = /\{[^}]*\}/g;
// Placeholder a reference is replaced with while the expression is being validated.
const OPERAND = '@';
// A binary operator between two operands. '-' has to be recognised by its operands, so
// that it is not confused with a dash inside an identifier or a negative number.
const BINARY_OPERATOR = /[*/+]|(?<=[@\d)])\s*-\s*(?=[@\d.(])/;
const BINARY_OPERATORS = new RegExp(BINARY_OPERATOR, 'g');
// A number with an optional unit, e.g. "2", "-0.5", "1.5rem", "100%".
const NUMBER = /^-?(\d+\.?\d*|\.\d+)([a-z]+|%)?$/i;

/**
 * Whether the value is a math expression over token references, as opposed to a value that
 * merely happens to contain a reference and an operator, e.g. "{host}/icon.svg".
 *
 * @param {string} value
 * @returns {boolean}
 */
function isMathExpression(value) {
  const expression = value.replace(REFERENCE, OPERAND);

  if (!BINARY_OPERATOR.test(expression)) {
    return false;
  }

  // Every operand has to be a reference or a number, otherwise this is not math.
  return expression
    .split(BINARY_OPERATORS)
    .map((operand) => operand.replace(/[()]/g, '').trim())
    .every((operand) => operand === '' || operand === OPERAND || NUMBER.test(operand));
}

/**
 * Token Studio lets a token be a math expression over other tokens, e.g.
 * "{xs.line.height} * {base.font.size}". The `ts/resolveMath` transform evaluates it, but
 * since we build with `outputReferences`, the css format ignores the computed value and
 * re-inserts the references into the *original* expression instead. That leaves the bare
 * math operator in the output: "var(--gw-xs-line-height) * var(--gw-base-font-size)",
 * which is not valid CSS.
 *
 * Wrapping such expressions in `calc()` up front makes both paths valid: the references
 * are kept (so the value still follows its dependencies) inside a `calc()` the browser can
 * evaluate, and `ts/resolveMath` still reduces the expression for consumers that resolve
 * references instead of outputting them.
 *
 * @param {import('style-dictionary').default} sd
 * @returns {string} the preprocessor name
 */
function registerWrapMathInCalc(sd) {
  const wrapValue = (value) => {
    if (typeof value !== 'string' || !value.includes('{')) {
      return value;
    }
    // Already wrapped, e.g. a value that is authored as calc() in Token Studio.
    if (/^calc\(.*\)$/s.test(value.trim())) {
      return value;
    }
    if (!isMathExpression(value)) {
      return value;
    }

    // Inside calc(), binary '+' and '-' are only valid when surrounded by whitespace.
    const spaced = value
      .replace(/\s*\+\s*/g, ' + ')
      .replace(/(\}|[\d%a-z)])\s*-\s*(\{|[\d.(])/gi, '$1 - $2');

    return `calc(${spaced})`;
  };

  // A token value can be a string, a composite object (typography, border, ...) or an
  // array of those (shadow), so every string leaf of the value is visited.
  const wrapLeaves = (value) => {
    if (Array.isArray(value)) {
      return value.map(wrapLeaves);
    }
    if (value !== null && typeof value === 'object') {
      Object.keys(value).forEach((prop) => {
        value[prop] = wrapLeaves(value[prop]);
      });
      return value;
    }
    return wrapValue(value);
  };

  const wrapTokens = (slice) => {
    Object.keys(slice).forEach((key) => {
      // '$type', '$extensions' and friends are token metadata, not nested tokens.
      if (key.startsWith('$')) {
        return;
      }

      const node = slice[key];
      if (node === null || typeof node !== 'object') {
        return;
      }

      if (node.$value !== undefined) {
        node.$value = wrapLeaves(node.$value);
      }

      wrapTokens(node);
    });
    return slice;
  };

  sd.registerPreprocessor({
    name: WRAP_MATH_IN_CALC,
    preprocessor: (dictionary) => wrapTokens(dictionary),
  });

  return WRAP_MATH_IN_CALC;
}

const PREPROCESSORS = [
  registerWrapMathInCalc,
];

/**
 * Registers our custom preprocessors and returns their names, to be appended to the
 * `preprocessors` of the Style Dictionary config. They run after the ones listed before
 * them, so the 'tokens-studio' preprocessor should stay first.
 *
 * @param {import('style-dictionary').default} sd
 * @returns {string[]} the preprocessor names to use
 */
export function registerCustomPreprocessors(sd) {
  return PREPROCESSORS.map((registerPreprocessor) => registerPreprocessor(sd));
}
