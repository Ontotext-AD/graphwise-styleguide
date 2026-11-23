import { compareDeprecatedVariables, listDeprecatedVariables } from './deprecated-tokens.js';

const token = (path, $deprecated) => ({ path: path.split('.'), name: `gw-${path.replaceAll('.', '-')}`, $deprecated });
const deprecated = (replacementToken, message = '') => ({ severity: 'warning', message, replacementToken });

describe('listDeprecatedVariables', () => {
  it('lists the deprecated variables with their replacements, sorted by variable', () => {
    const tokens = [
      token('button.warning.color', deprecated('button.warn.color')),
      token('button.warning.background', deprecated('button.warn.background', 'Use the warn button')),
      token('button.warn.color'),
      token('button.warn.background'),
    ];

    expect(listDeprecatedVariables(tokens)).toEqual([
      {
        variable: '--gw-button-warning-background',
        replacement: '--gw-button-warn-background',
        token: 'button.warning.background',
        replacementToken: 'button.warn.background',
        message: 'Use the warn button',
      },
      {
        variable: '--gw-button-warning-color',
        replacement: '--gw-button-warn-color',
        token: 'button.warning.color',
        replacementToken: 'button.warn.color',
        message: '',
      },
    ]);
  });

  it('returns nothing when no token is deprecated', () => {
    expect(listDeprecatedVariables([token('button.warn.color')])).toEqual([]);
  });

  it('fails when the replacement does not exist', () => {
    const tokens = [token('button.warning.color', deprecated('button.warn.colour')), token('button.warn.color')];

    expect(() => listDeprecatedVariables(tokens)).toThrow(
      'button.warning.color is replaced by button.warn.colour, which does not exist'
    );
  });

  it('fails when the replacement is not output as a CSS variable', () => {
    const tokens = [token('button.warning.color', deprecated('figma.warn.color')), token('figma.warn.color')];
    const isOutput = (t) => !t.path.includes('figma');

    expect(() => listDeprecatedVariables(tokens, isOutput)).toThrow('which does not exist');
  });

  it('fails when the replacement is deprecated itself', () => {
    const tokens = [
      token('button.old.color', deprecated('button.warning.color')),
      token('button.warning.color', deprecated('button.warn.color')),
      token('button.warn.color'),
    ];

    expect(() => listDeprecatedVariables(tokens)).toThrow(
      'button.old.color is replaced by button.warning.color, which is deprecated itself'
    );
  });

  it('fails when there is no replacement', () => {
    const tokens = [token('button.warning.color', deprecated(undefined))];

    expect(() => listDeprecatedVariables(tokens)).toThrow('button.warning.color has no replacementToken');
  });

  it('reports all invalid tokens at once', () => {
    const tokens = [
      token('button.warning.color', deprecated('button.warn.colour')),
      token('button.warning.background', deprecated('button.warn.bg')),
    ];

    expect(() => listDeprecatedVariables(tokens)).toThrow(/warning\.color[\s\S]*warning\.background/);
  });
});

describe('compareDeprecatedVariables', () => {
  const entry = (variable) => ({ variable, replacement: `${variable}-new` });

  it('marks the variables that were not deprecated in the previous release as new', () => {
    const current = [entry('--gw-a'), entry('--gw-b')];

    expect(compareDeprecatedVariables(current, [entry('--gw-a')])).toEqual([
      { ...entry('--gw-a'), isNew: false },
      { ...entry('--gw-b'), isNew: true },
    ]);
  });

  it('marks all as new when the previous release has no deprecated variables listed', () => {
    expect(compareDeprecatedVariables([entry('--gw-a')], [])).toEqual([{ ...entry('--gw-a'), isNew: true }]);
  });
});
