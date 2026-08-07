import type {
  TypedManagerDrivers,
  TypedManagerSettings,
} from '@olivierzal/homey-kit/types'
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

  // The SDK interfaces are extended, not replaced: the kit generics
  // supply the narrowed member SIGNATURES, the base supplies everything
  // else. Extending both directly conflicts on the members they share.
  interface ManagerDrivers extends HomeyLib.ManagerDrivers {
    getDrivers: TypedManagerDrivers<HeatzyDriver>['getDrivers']
  }

  interface ManagerSettings extends HomeyLib.ManagerSettings {
    get: TypedManagerSettings<HomeySettings>['get']
    set: TypedManagerSettings<HomeySettings>['set']
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
