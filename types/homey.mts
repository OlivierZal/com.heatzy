import type {
  TypedManagerDrivers,
  TypedManagerSettings,
} from '@olivierzal/homey-kit/types'
import type { Homey } from 'homey'
import type SdkManagerDrivers from 'homey/manager/drivers'
import type SdkManagerSettings from 'homey/manager/settings'

import type HeatzyDriver from '../drivers/heatzy/driver.mts'
import type { HomeySettings } from './app-settings.mts'

// The Homey instance as this app sees it. `app` is typed by the SDK's
// own seam, `HomeyTypes` (homey-override.d.ts); the managers are
// narrowed here, app-side. Only the app class re-declares `homey` with
// it — a driver or a device reaches the typed managers through
// `this.homey.app`.
export interface HeatzyHomey extends Homey {
  readonly drivers: ManagerDrivers
  readonly settings: ManagerSettings
}

// The SDK managers, each narrowed member taken from the kit generic, so
// every member has one declaration site: extending the generic beside
// the SDK class would leave the shared members declared twice, a
// conflict TypeScript resolves silently to the SDK's wider type. The
// class supplies everything else.
export interface ManagerDrivers extends SdkManagerDrivers {
  readonly getDrivers: TypedManagerDrivers<HeatzyDriver>['getDrivers']
}

export interface ManagerSettings extends SdkManagerSettings {
  readonly get: TypedManagerSettings<HomeySettings>['get']
  readonly set: TypedManagerSettings<HomeySettings>['set']
  readonly unset: TypedManagerSettings<HomeySettings>['unset']
}
