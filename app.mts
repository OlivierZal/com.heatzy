import 'source-map-support/register.js'

import {
  type DeviceFacadeAny,
  type Logger,
  type SettingManager,
  type SyncCallback,
  FacadeManager,
  HeatzyAPI,
} from '@olivierzal/heatzy-api'
import {
  fireAndForget,
  NotFoundError,
  selectChangelogEntries,
  sequential,
} from '@olivierzal/homey-kit'
import {
  type DriverSetting,
  getDriverLoginSetting,
  getDriverSettings,
  mergeDeviceSettings,
} from '@olivierzal/homey-kit/manifest'

import type HeatzyDevice from './drivers/heatzy/device.mts'
import type { HomeySettings } from './types/app-settings.mts'
import type { DeviceSettings, Settings } from './types/device-settings.mts'
import { changelog } from './files.mts'
import { type Homey, App } from './lib/homey.mts'

const NOTIFICATION_DELAY_MS = 10_000

// The one boundary where a settings key arrives untyped: the library's
// `SettingManager` is keyed by plain strings, and it derives each key
// from the name of the accessor its `@setting` decorator wraps — so the
// key set belongs to the library and grows with its releases. Narrowing
// by membership would drop a write the day the library persists one
// more field, so the assertion stays, alone, here.
const settingKey = (key: string): keyof HomeySettings =>
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- the library's SettingManager contract types its keys as plain strings
  key as keyof HomeySettings

export default class HeatzyApp extends App {
  declare public readonly homey: Homey.Homey

  public get api(): HeatzyAPI {
    return this.#api
  }

  // One shutdown signal for the API client: onUninit aborts it so
  // in-flight requests cannot outlive the app instance.
  readonly #abortController = new AbortController()

  #api!: HeatzyAPI

  #facadeManager!: FacadeManager

  // Loss-episode ledger, written SYNCHRONOUSLY by both lib event
  // callbacks and read by the deferred halves: 'pending' = loss
  // announced, deferred handler undecided; 'shown' = loss notification
  // actually displayed. A recovery arriving while a loss is still
  // 'pending' (a self-heal during boot, before `homey.ready()`
  // resolves) erases the episode so neither stale notification fires.
  #sessionLossState: 'pending' | 'shown' | null = null

  public override async onInit(): Promise<void> {
    // Boot marks: everything before the first line is module require +
    // SDK handshake, and `ready` lands once every driver and device
    // initialized — the discriminators for slow-hardware
    // `ready_timeout` diagnostics.
    this.log('Boot: onInit after', process.uptime().toFixed(1), 's')
    const language = this.homey.i18n.getLanguage()
    // The previous major persisted the session expiry as `expireAt`
    // (epoch seconds); the credentials survive, so a one-time re-login
    // replaces any migration.
    this.homey.settings.unset('expireAt')
    this.#api = await HeatzyAPI.create({
      abortSignal: this.#abortController.signal,
      events: {
        onSyncComplete: this.#onSync,
        onAuthenticationLost: () => {
          this.#notifySessionLost()
        },
        onAuthenticationRestored: () => {
          this.#notifySessionRestored()
        },
      },
      locale: language,
      logger: this.#createLogger(),
      settingManager: this.#createSettingManager(),
      shouldResumeSessionInBackground: true,
      timezone: this.homey.clock.getTimezone(),
    })
    this.#facadeManager = new FacadeManager(this.#api)
    this.#createNotification(language)
    // Poke any open webview to re-run its freshness handshake: an app
    // (re)boot is exactly when the served hashes may have moved.
    this.homey.api.realtime('webview_hashes_changed', null)
    fireAndForget(this.#logBootReady(), this, 'Boot readiness tracking failed:')
  }

  public override async onUninit(): Promise<void> {
    this.#abortController.abort()
    this.#api.clearSync()
    await Promise.resolve()
  }

  public getDeviceSettings(): DeviceSettings {
    const deviceSettings: DeviceSettings = {}
    for (const device of this.#getDevices()) {
      const {
        driver: { id: driverId },
      } = device
      deviceSettings[driverId] ??= {}
      mergeDeviceSettings(deviceSettings[driverId], device.getSettings())
    }
    return deviceSettings
  }

  public getDriverSettings(): Partial<Record<string, DriverSetting[]>> {
    const language = this.homey.i18n.getLanguage()
    return Object.groupBy(
      this.homey.manifest.drivers.flatMap((driver) => [
        ...getDriverSettings(driver, language),
        ...getDriverLoginSetting(driver, language),
      ]),
      ({ driverId, groupId }) => groupId ?? driverId,
    )
  }

  public getFacade(id: string): DeviceFacadeAny {
    const instance = this.#api.registry.devices.getById(id)
    if (instance === undefined) {
      throw new NotFoundError(this.homey.__('errors.deviceNotFound'))
    }
    return this.#facadeManager.get(instance)
  }

  public async updateDeviceSettings(settings: Settings): Promise<void> {
    await Promise.all(
      this.#getDevices().map(async (device) => {
        const changedKeys = Object.keys(settings).filter(
          (changedKey) =>
            settings[changedKey] !== device.getSetting(changedKey),
        )
        if (changedKeys.length === 0) {
          return
        }
        await device.setSettings(
          Object.fromEntries(changedKeys.map((key) => [key, settings[key]])),
        )
        await device.onSettings({
          changedKeys,
          newSettings: device.getSettings(),
        })
      }),
    )
  }

  readonly #onSync: SyncCallback = async ({ ids } = {}) => {
    await this.#syncFromDevices(ids)
  }

  // Deferred half of the loss notification: the readiness await orders
  // the device check after driver init — a backed-off resume reports
  // the loss during `App#onInit`, when `getDrivers()` is still empty.
  // The pending-state re-check after the notification IPC keeps a
  // recovery that landed mid-flight from resurrecting the episode.
  async #announceSessionLost(): Promise<void> {
    await this.homey.ready()
    if (!this.#shouldAnnounceSessionLost()) {
      return
    }
    try {
      await this.homey.notifications.createNotification({
        excerpt: this.homey.__('notifications.sessionExpired'),
      })
    } catch {
      // Non-critical: notification display is best-effort — the
      // episode stays 'pending', so no recovery follow-up will
      // reference a notification the user never saw.
      return
    }
    if (this.#sessionLossState === 'pending') {
      this.#sessionLossState = 'shown'
    }
  }

  #createLogger(): Logger {
    return {
      error: (...args: unknown[]): void => {
        this.error(...args)
      },
      log: (...args: unknown[]): void => {
        this.log(...args)
      },
    }
  }

  #createNotification(language: string): void {
    const { homey } = this
    const {
      manifest: { version },
      notifications,
      settings,
    } = homey
    // Every release since the one already announced, not just the
    // running one: a user who updates rarely would otherwise never hear
    // about the versions in between.
    // The SDK read is untyped, as everywhere else settings are read: a
    // stored value that is not a string reads as no baseline at all.
    const notified: unknown = settings.get('notifiedVersion')
    const { entries } = selectChangelogEntries({
      changelog,
      from: typeof notified === 'string' ? notified : null,
      language,
      to: version,
    })
    if (entries.length === 0) {
      return
    }
    homey.setTimeout(async () => {
      try {
        await sequential(entries, async ({ excerpt }) => {
          await notifications.createNotification({ excerpt })
        })
        settings.set('notifiedVersion', version)
      } catch {
        // Non-critical: notification display is best-effort
      }
    }, NOTIFICATION_DELAY_MS)
  }

  #createSettingManager(): SettingManager {
    return {
      get: (key: string): string | null | undefined => {
        const value: unknown = this.homey.settings.get(settingKey(key))
        return typeof value === 'string' || value === null ? value : undefined
      },
      set: (key: string, value: string): void => {
        this.homey.settings.set(settingKey(key), value)
      },
      unset: (key: string): void => {
        this.homey.settings.unset(settingKey(key))
      },
    }
  }

  #getDevices(ids?: readonly string[]): HeatzyDevice[] {
    return Object.values(this.homey.drivers.getDrivers()).flatMap((driver) => {
      const devices = driver.getDevices()
      return ids === undefined
        ? devices
        : devices.filter(({ id }) => ids.includes(id))
    })
  }

  #hasPairedDevices(): boolean {
    return this.#getDevices().length > 0
  }

  async #logBootReady(): Promise<void> {
    await this.homey.ready()
    // Measurement breadcrumb (2026-08): the installed base's platform
    // split (1 = Homey Pro 2016-2019, 2 = Pro 2023+) decides the node
    // device-floor policy — read it from diagnostics reports.
    this.log(
      'Boot: ready after',
      process.uptime().toFixed(1),
      's — platform',
      this.homey.platformVersion ?? 'unknown',
      '— node',
      process.version,
    )
  }

  // User-facing half of heatzy-api's onAuthenticationLost contract:
  // nothing else can surface a background session loss (no webview is
  // open when a sync loses the session). The library fires once per
  // loss episode, so no dedup is needed here; the deferral mirrors
  // #createNotification (off the event callstack, best-effort). The
  // episode is recorded synchronously so a recovery event can never
  // outrun it.
  #notifySessionLost(): void {
    this.#sessionLossState = 'pending'
    this.homey.setTimeout(async () => this.#announceSessionLost(), 0)
  }

  // Recovery counterpart of #notifySessionLost, fed by heatzy-api's
  // onAuthenticationRestored (once per loss episode). Consumes the
  // episode synchronously: a loss still 'pending' means the user never
  // saw it — erasing it silences BOTH the stale loss (its parked
  // handler finds no pending episode) and this follow-up. Only a loss
  // actually displayed earns the "signed in again" confirmation.
  #notifySessionRestored(): void {
    const state = this.#sessionLossState
    this.#sessionLossState = null
    if (state !== 'shown') {
      return
    }
    this.homey.setTimeout(async () => {
      try {
        await this.homey.notifications.createNotification({
          excerpt: this.homey.__('notifications.sessionRestored'),
        })
      } catch {
        // Non-critical: notification display is best-effort
      }
    }, 0)
  }

  // Residual credentials without any paired device only get a log
  // line: the timeline nag is reserved for a loss that stops device
  // updates.
  #shouldAnnounceSessionLost(): boolean {
    if (this.#sessionLossState !== 'pending') {
      // The session recovered while we waited: the loss is stale.
      return false
    }
    if (this.#hasPairedDevices()) {
      return true
    }
    this.#sessionLossState = null
    this.log('Session lost ignored: no paired device')
    return false
  }

  async #syncFromDevices(ids?: readonly string[]): Promise<void> {
    const results = await Promise.allSettled(
      this.#getDevices(ids).map(async (device) => device.syncFromDevice()),
    )
    for (const result of results) {
      if (result.status === 'rejected') {
        this.error('Device sync failed:', result.reason)
      }
    }
  }
}
