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
  }),
])

export default config
