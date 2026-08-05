import type HomeyLib from 'homey/lib/Homey.js'

import type HeatzyApp from './app.mts'
import type HeatzyDriver from './drivers/heatzy/driver.mts'
import type { HomeySettings } from './types/app-settings.mts'
import type { Manifest } from './types/manifest.mts'

declare module 'homey' {
  interface Homey extends HomeyLib {
    app: HeatzyApp
    drivers: ManagerDrivers
    manifest: Manifest
    settings: ManagerSettings
  }

  interface ManagerDrivers extends HomeyLib.ManagerDrivers {
    getDrivers: () => Record<string, HeatzyDriver>
  }

  interface ManagerSettings extends HomeyLib.ManagerSettings {
    get: ((key: string) => unknown) &
      (<T extends keyof HomeySettings>(key: T) => HomeySettings[T])
    set: ((key: string, value: unknown) => void) &
      (<T extends keyof HomeySettings>(key: T, value: HomeySettings[T]) => void)
  }
}

// The SDK module only default-exports the `Homey` class: this block is
// what gives it a NAMED `Homey` interface export (with the typed `app`)
// for the api surface's `import type { Homey } from 'homey/lib/Homey'`.
declare module 'homey/lib/Homey.js' {
  interface Homey extends HomeyLib {
    app: HeatzyApp
  }
}
