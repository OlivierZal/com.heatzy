import { homeyApp } from '@olivierzal/configs/eslint/homey-app'
import { type Config, defineConfig } from 'eslint/config'

const config: Config[] = defineConfig([
  { ignores: ['.homeybuild/', 'coverage/'] },
  ...homeyApp({
    bundledSourceGlobs: ['settings/**'],
    defaultExportFiles: ['api.mts', 'app.mts', 'drivers/*/{device,driver}.mts'],
    jsdocFiles: [
      '{api,app,files}.mts',
      'drivers/**/*.mts',
      'lib/**/*.mts',
      'types/**/*.mts',
    ],
    untypedDoubleTestFiles: [
      'tests/unit/app.test.ts',
      'tests/unit/*{device,driver}*.test.ts',
    ],
    webviewFloorFiles: ['settings/**/*.mts'],
    wireNamingEntries: [
      // The Glow generation's lock attribute: `@olivierzal/heatzy-api`
      // declares it on the post payload and the device is sent it
      // verbatim, unlike its snake_case siblings. Enumerated so that no
      // other screaming-case property rides along.
      {
        filter: { match: true, regex: '^LOCK_C$' },
        format: null,
        selector: 'objectLiteralProperty',
      },
    ],
  }),
])

export default config
