import StyleDictionary from 'style-dictionary';
import { register, expandTypesMap } from '@tokens-studio/sd-transforms';
import fs from 'fs';
import path from 'path';

// will register them on StyleDictionary object
// that is installed as a dependency of this package.
register(StyleDictionary, {
  excludeParentKeys: true,
});

const filesConfig = {
    format: 'css/variables',
    destination: 'variables.css',
    // Filter out tokens that are specific to Figma and not needed in the final CSS.
    filter: (token) => !token.path.includes('figma'),
    options: {
        // This ensures that your CSS variables can reference other CSS variables.
        outputReferences: true,
        // Example of other options you could use:
        // selector: '.gdb', // to scope variables to a specific class
        // outputReferenceFallbacks: true // to add fallbacks for references
    },
};

// Define the configuration using the Config type from style-dictionary
const configuration = {
  source: [],
  preprocessors: ['tokens-studio'],
  expand: {
    typesMap: expandTypesMap,
  },
  // You can enable more detailed error logging if needed
  log: {
    errors: {
      brokenReferences: 'console',
    },
    verbosity: 'verbose',
  },
  platforms: {
    css: {
      buildPath: 'dist',
      prefix: 'gw',
      // The 'tokens-studio' transformGroup applies a comprehensive set of transforms.
      // It's a great starting point provided by the sd-transforms package.
      transformGroup: 'tokens-studio',
      // You can still add or override specific transforms if needed.
      // For example, if you wanted a different naming convention.
      transforms: ['name/kebab'],
      files: [],
    },
  },
};

/**
 * @param {'Light'|'Dark'} mode
 */
function modifyTokensForMode(mode) {
    // eslint-disable-next-line no-console
    console.log(`########## Generating ${mode} mode tokens file ##########`);
    const tokens = JSON.parse(fs.readFileSync('tokens/tokens.json', 'utf8'));

    const inverseMode = mode === 'Light' ? 'Dark' : 'Light';
    const theme = `theme/${inverseMode.toLowerCase()}`;

    if(tokens[theme]) {
      delete tokens[theme];
    }

    const themeTokensIndex = tokens['$themes'].findIndex(t => t.name === inverseMode);
    if(themeTokensIndex === -1) {
      throw new Error(`No theme with name ${inverseMode} found in $themes`);
    }
    tokens['$themes'].splice(themeTokensIndex, 1);

    const tokensetIndex = tokens['$metadata']['tokenSetOrder'].findIndex((set) => set === theme);
    tokens['$metadata']['tokenSetOrder'].splice(tokensetIndex, 1);

    const modesDir = path.join(process.cwd(), 'modes');
    fs.writeFileSync(path.join(modesDir, `${mode.toLowerCase()}-mode-tokens.json`), JSON.stringify(tokens, null, 2));
}

/**
 * Main build function to run Style Dictionary.
 * Using an async function allows us to use top-level await.
 */
async function main() {
  const modesDir = path.join(process.cwd(), 'modes');
  if (fs.existsSync(modesDir)) {
    fs.rmSync(modesDir, { recursive: true, force: true });
  }
  fs.mkdirSync(modesDir);

  modifyTokensForMode('Light');
  modifyTokensForMode('Dark');

  // eslint-disable-next-line no-console
  console.log('########## Building Light theme ##########');
  const lightConfig = {
    ...configuration,
  };
  lightConfig.source = ['modes/light-mode-tokens.json'];
  lightConfig.platforms.css.files = [{
      ...filesConfig,
      destination: 'variables-light.css',
  }];
  let sd = new StyleDictionary(lightConfig);
  // eslint-disable-next-line no-console
  console.log('########## Cleaning old platform files ##########');
  await sd.cleanAllPlatforms();
  await sd.buildAllPlatforms();

  // eslint-disable-next-line no-console
  console.log('########## Building Dark theme ##########');
  const darkConfig = {
    ...configuration,
  };
  darkConfig.source = ['modes/dark-mode-tokens.json'];
  darkConfig.platforms.css.files = [{
      ...filesConfig,
      destination: 'variables-dark.css',
  }];
  sd = new StyleDictionary(darkConfig);
  await sd.buildAllPlatforms();

  // eslint-disable-next-line no-console
  console.log('########## Build complete! ##########');
}

// Execute the build process.
main().catch((error) => console.error('########## Error during build:', error));
