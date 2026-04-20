import path from 'path';
import { fileURLToPath } from 'url';
import { CssVariablePurger } from "./css-variable-purger.js";


const options = {};
options.inputFile = undefined;
options.outputFile = undefined;
options.debug = 'true';
options.includeDependencies = 'true';
options.includeStringReferences = 'true';
options.printUndeclaredWorkbenchCSSVariables = false;

function verifyResult(result) {
  // eslint-disable-next-line no-console
  console.log('\n✨ Purge completed successfully!');
  // eslint-disable-next-line no-console
  console.log(
    `📁 Output file contains ${result.usedVariables} used variables`
  );
  // eslint-disable-next-line no-console
  console.log(`🗑️  Removed ${result.removedVariables} unused variables`);

  if (result.missedCSSVariables && result.missedCSSVariables.length > 0) {
    // eslint-disable-next-line no-console
    console.log('The following CSS variables are used but not declared:');

    const gWCSSVariables = [];
    const workbenchCSSVariables = [];

    result.missedCSSVariables.forEach(variable => {
      if (variable.startsWith('--gw-')) {
        gWCSSVariables.push(variable);
      } else {
        workbenchCSSVariables.push(variable);
      }
    });
    // eslint-disable-next-line no-console
    gWCSSVariables.forEach(variable => console.log(`  ❌  ${variable}`));
    if (options.printUndeclaredWorkbenchCSSVariables) {
      // eslint-disable-next-line no-console
      workbenchCSSVariables.forEach(variable => console.log(`  ⚠️  ${variable}`));
    }

    // Exit with code 1 if at least one --gw- variable is missing
    if (gWCSSVariables.length > 0) {
      throw new Error(`There are css variables that are not declared ${JSON.stringify(gWCSSVariables)}`);
    }
  }
}

function purge(opts) {
  const purger = new CssVariablePurger(opts);
  return purger
    .purgeUnusedVariables()
    .then(verifyResult)
    .catch((error) => {
      console.error('\n❌ Purge failed:', error.message);
      if (opts.debug) {

        console.error(error.stack);
      }
      process.exit(1);
    });
}

export async function purgeCss(config) {

  const finalOptions = {
    ...options,
    ...config
  };

  const __dirname = path.dirname(fileURLToPath(import.meta.url));

  if (config.lightModeOutputFile) {
    const variablesLightInputFile = path.join(__dirname, '..', '..', 'dist', 'variables-light.css');
    await purge({
      ...finalOptions,
      inputFile:  path.resolve(variablesLightInputFile),
      outputFile: config.lightModeOutputFile
    });
  }

  if (config.darkModeOutputFile) {
    const variablesDarkInputFile = path.join(__dirname, '..', '..', 'dist', 'variables-dark.css');
    await purge({
      ...finalOptions,
      inputFile: path.resolve(variablesDarkInputFile),
      outputFile: config.darkModeOutputFile
    });
  }
}
