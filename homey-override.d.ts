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

declare module 'homey/lib/Homey.js' {
  interface Homey extends HomeyLib {
    app: HeatzyApp
  }
}
