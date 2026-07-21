import 'source-map-support/register.js'

import {
  type DeviceFacadeAny,
  type Logger,
  type SettingManager,
  type SyncCallback,
  FacadeManager,
  HeatzyAPI,
} from '@olivierzal/heatzy-api'

import type HeatzyDevice from './drivers/heatzy/device.mts'
import type { DeviceSettings, Settings } from './types/device-settings.mts'
import type { DriverSetting } from './types/driver-settings.mts'
import type { LoginSetting, ManifestDriver } from './types/manifest.mts'
import { changelog } from './files.mts'
import { NotFoundError } from './lib/errors.mts'
import { fireAndForget } from './lib/fire-and-forget.mts'
import { type Homey, App } from './lib/homey.mts'

const NOTIFICATION_DELAY_MS = 10_000

const localize = (
  strings: Partial<Record<string, string>> & { readonly en: string },
  language: string,
): string => strings[language] ?? strings.en

// Aggregates one device's settings into the per-driver map; a conflicting
// value across devices marks the setting as indeterminate (`null`) and stops
// processing the remaining settings of that device.
const mergeDeviceSettings = (
  driverSettings: Record<string, unknown>,
  settings: Record<string, unknown>,
): void => {
  for (const [settingId, value] of Object.entries(settings)) {
    if (!Object.hasOwn(driverSettings, settingId)) {
      driverSettings[settingId] = value
    } else if (driverSettings[settingId] !== value) {
      driverSettings[settingId] = null
      return
    }
  }
}

const getDriverSettings = (
  { id: driverId, name, settings }: ManifestDriver,
  language: string,
): DriverSetting[] => {
  const driverLabel = localize(name, language)
  return (settings ?? []).flatMap(
    ({ children, id: groupId, label: groupLabel }) =>
      (children ?? []).map(({ id, label, max, min, type, units, values }) => ({
        driverId,
        driverLabel,
        groupId,
        groupLabel: localize(groupLabel, language),
        id,
        max,
        min,
        title: localize(label, language),
        type,
        units,
        values: values?.map(({ id: valueId, label: valueLabel }) => ({
          id: valueId,
          label: localize(valueLabel, language),
        })),
      })),
  )
}

const getDriverLoginSetting = (
  { id: driverId, name, pair }: ManifestDriver,
  language: string,
): DriverSetting[] => {
  const driverLabel = localize(name, language)
  const driverLoginSetting: Record<string, DriverSetting> = {}
  const loginOptions =
    pair?.find(
      (pairSetting): pairSetting is LoginSetting => pairSetting.id === 'login',
    )?.options ?? []
  for (const [option, label] of Object.entries(loginOptions)) {
    const isPassword = option.startsWith('password')
    const key = isPassword ? 'password' : 'username'
    driverLoginSetting[key] ??= {
      driverId,
      driverLabel,
      groupId: 'login',
      id: key,
      title: '',
      type: isPassword ? 'password' : 'text',
    }
    driverLoginSetting[key] = {
      ...driverLoginSetting[key],
      [option.endsWith('Placeholder') ? 'placeholder' : 'title']: localize(
        label,
        language,
      ),
    }
  }
  return Object.values(driverLoginSetting)
}

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
    fireAndForget(
      this.#logBootReady(),
      (...args: unknown[]) => {
        this.error(...args)
      },
      'Boot readiness tracking failed:',
    )
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

  public async setDeviceSettings(settings: Settings): Promise<void> {
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
    if (settings.get('notifiedVersion') === version) {
      return
    }
    const changelogByVersion = changelog as Record<
      string,
      Record<string, string>
    >
    const versionChangelog = changelogByVersion[version] ?? {}
    const excerpt = versionChangelog[language]
    if (excerpt === undefined) {
      return
    }
    homey.setTimeout(async () => {
      try {
        await notifications.createNotification({ excerpt })
        settings.set('notifiedVersion', version)
      } catch {
        // Non-critical: notification display is best-effort
      }
    }, NOTIFICATION_DELAY_MS)
  }

  #createSettingManager(): SettingManager {
    return {
      get: (key: string): string | null | undefined => {
        const value: unknown = this.homey.settings.get(key)
        return typeof value === 'string' || value === null ? value : undefined
      },
      set: (key: string, value: string): void => {
        this.homey.settings.set(key, value)
      },
      unset: (key: string): void => {
        this.homey.settings.unset(key)
      },
    }
  }

  #getDevices(ids?: readonly string[]): HeatzyDevice[] {
    return Object.values(this.homey.drivers.getDrivers()).flatMap((driver) => {
      const devices = driver.getDevices()
      return ids === undefined ? devices : (
          devices.filter(({ id }) => ids.includes(id))
        )
    })
  }

  #hasPairedDevices(): boolean {
    return this.#getDevices().length > 0
  }

  async #logBootReady(): Promise<void> {
    await this.homey.ready()
    this.log('Boot: ready after', process.uptime().toFixed(1), 's')
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

  // Per-device sync failures are logged without aborting the full run.
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
