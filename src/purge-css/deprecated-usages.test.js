import fs from 'fs';
import os from 'os';
import path from 'path';
import { findDeprecatedUsages, readDeprecatedVariables } from './deprecated-usages.js';

const deprecated = [
  { variable: '--gw-button-warning-color', replacement: '--gw-button-warn-color' },
  { variable: '--gw-button-warning', replacement: '--gw-button-warn' },
];

describe('findDeprecatedUsages', () => {
  it('finds the usages with the file, the line and the replacement', () => {
    const files = [
      { file: 'src/button.scss', content: '.button {\n  color: var(--gw-button-warning-color);\n}' },
      { file: 'src/theme.ts', content: "style.getPropertyValue('--gw-button-warning');" },
    ];

    expect(findDeprecatedUsages(files, deprecated)).toEqual([
      { file: 'src/button.scss', line: 2, variable: '--gw-button-warning-color', replacement: '--gw-button-warn-color' },
      { file: 'src/theme.ts', line: 1, variable: '--gw-button-warning', replacement: '--gw-button-warn' },
    ]);
  });

  it('finds every usage on a line, including overrides', () => {
    const files = [{ file: 'a.css', content: '--gw-button-warning-color: var(--gw-button-warning);' }];

    expect(findDeprecatedUsages(files, deprecated).map((usage) => usage.variable)).toEqual([
      '--gw-button-warning-color',
      '--gw-button-warning',
    ]);
  });

  it('ignores longer variables that start with a deprecated one', () => {
    const files = [{ file: 'a.css', content: 'color: var(--gw-button-warning-color-hover); --gw-button-warning2: 0;' }];

    expect(findDeprecatedUsages(files, deprecated)).toEqual([]);
  });

  it('ignores the replacements', () => {
    const files = [{ file: 'a.css', content: 'color: var(--gw-button-warn-color);' }];

    expect(findDeprecatedUsages(files, deprecated)).toEqual([]);
  });

  it('finds nothing when no variable is deprecated', () => {
    expect(findDeprecatedUsages([{ file: 'a.css', content: 'var(--gw-a)' }], [])).toEqual([]);
  });
});

describe('readDeprecatedVariables', () => {
  let dir;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deprecated-usages-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const write = (theme, entries) =>
    fs.writeFileSync(path.join(dir, `deprecated-variables-${theme}.json`), JSON.stringify(entries));

  it('merges the themes', () => {
    write('light', [deprecated[0]]);
    write('dark', [deprecated[0], deprecated[1]]);

    expect(readDeprecatedVariables(dir)).toEqual(deprecated);
  });

  it('returns nothing for a styleguide without the files', () => {
    expect(readDeprecatedVariables(dir)).toEqual([]);
  });
});
