import type HomeyLib from 'homey/lib/Homey.js'

import type HeatzyApp from './app.mts'
import type HeatzyDriver from './drivers/heatzy/driver.mts'
import type { HomeySettings, Manifest } from './types.mts'

declare module 'homey' {
  interface Homey extends HomeyLib {
    app: HeatzyApp
    drivers: ManagerDrivers
    manifest: Manifest
    settings: ManagerSettings
  }

  interface ManagerDrivers extends HomeyLib.ManagerDrivers {
    getDriver: (driverId: string) => HeatzyDriver
    getDrivers: () => Record<string, HeatzyDriver>
  }

  interface ManagerSettings extends HomeyLib.ManagerSettings {
    get: <T extends keyof HomeySettings>(key: T) => HomeySettings[T]
    set: <T extends keyof HomeySettings>(
      key: T,
      value: HomeySettings[T],
    ) => void
  }
}

declare module 'homey/lib/Homey.js' {
  interface Homey extends HomeyLib {
    app: HeatzyApp
  }
}
