import 'source-map-support/register.js'

// eslint-disable-next-line import-x/no-extraneous-dependencies
import Homey from 'homey'

import {
  type IDeviceFacadeAny,
  type LoginPostData,
  DeviceModel,
  FacadeManager,
  HeatzyAPI,
} from '@olivierzal/heatzy-api'

import type HeatzyDevice from './drivers/heatzy/device.mts'
import type {
  DeviceSettings,
  DriverSetting,
  LoginSetting,
  ManifestDriver,
  Settings,
} from './types.mts'

import { changelog } from './files.mts'

const NOTIFICATION_DELAY = 10_000

const hasChangelogLanguage = (
  versionChangelog: object,
  language: string,
): language is keyof typeof versionChangelog => language in versionChangelog

const getDriverSettings = (
  { id: driverId, settings }: ManifestDriver,
  language: string,
): DriverSetting[] =>
  (settings ?? []).flatMap(({ children, id: groupId, label: groupLabel }) =>
    (children ?? []).map(({ id, label, max, min, type, units, values }) => ({
      driverId,
      groupId,
      groupLabel: groupLabel[language] ?? groupLabel.en,
      id,
      max,
      min,
      title: label[language] ?? label.en,
      type,
      units,
      values: values?.map(({ id: valueId, label: valueLabel }) => ({
        id: valueId,
        label: valueLabel[language] ?? valueLabel.en,
      })),
    })),
  )

const getDriverLoginSetting = (
  { id: driverId, pair }: ManifestDriver,
  language: string,
): DriverSetting[] => {
  const driverLoginSetting: Record<string, DriverSetting> = {}
  for (const [option, label] of Object.entries(
    pair?.find(
      (pairSetting): pairSetting is LoginSetting => pairSetting.id === 'login',
    )?.options ?? [],
  )) {
    const isPassword = option.startsWith('password')
    const key = isPassword ? 'password' : 'username'
    driverLoginSetting[key] ??= {
      driverId,
      groupId: 'login',
      id: key,
      title: '',
      type: isPassword ? 'password' : 'text',
    }
    driverLoginSetting[key] = {
      ...driverLoginSetting[key],
      [option.endsWith('Placeholder') ? 'placeholder' : 'title']:
        label[language] ?? label.en,
    }
  }
  return Object.values(driverLoginSetting)
}

// eslint-disable-next-line import-x/no-named-as-default-member
export default class HeatzyApp extends Homey.App {
  declare public readonly homey: Homey.Homey

  #api!: HeatzyAPI

  #facadeManager!: FacadeManager

  public get api(): HeatzyAPI {
    return this.#api
  }

  public override async onInit(): Promise<void> {
    const language = this.homey.i18n.getLanguage()
    this.#api = await HeatzyAPI.create({
      language,
      logger: {
        error: (...args) => {
          this.error(...args)
        },
        log: (...args) => {
          this.log(...args)
        },
      },
      settingManager: this.homey.settings,
      timezone: this.homey.clock.getTimezone(),
      onSync: async (params) => this.#syncFromDevices(params),
    })
    this.#facadeManager = new FacadeManager(this.#api)
    this.#createNotification(language)
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  public override async onUninit(): Promise<void> {
    this.#api.clearSync()
  }

  public getDeviceSettings(): DeviceSettings {
    const deviceSettings: DeviceSettings = {}
    for (const device of this.#getDevices()) {
      const {
        driver: { id: driverId },
      } = device
      deviceSettings[driverId] ??= {}
      for (const [settingId, value] of Object.entries(device.getSettings())) {
        if (!(settingId in deviceSettings[driverId])) {
          deviceSettings[driverId][settingId] = value
        } else if (deviceSettings[driverId][settingId] !== value) {
          deviceSettings[driverId][settingId] = null
          break
        }
      }
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

  public getFacade(id: string): IDeviceFacadeAny {
    const instance = DeviceModel.getById(id)
    if (!instance) {
      throw new Error(this.homey.__('errors.deviceNotFound'))
    }
    return this.#facadeManager.get(instance)
  }

  public async login(data: LoginPostData): Promise<boolean> {
    return this.api.authenticate(data)
  }

  public async setDeviceSettings(settings: Settings): Promise<void> {
    await Promise.all(
      this.#getDevices().map(async (device) => {
        const changedKeys = Object.keys(settings).filter(
          (changedKey) =>
            settings[changedKey] !== device.getSetting(changedKey),
        )
        if (changedKeys.length) {
          await device.setSettings(
            Object.fromEntries(changedKeys.map((key) => [key, settings[key]])),
          )
          await device.onSettings({
            changedKeys,
            newSettings: device.getSettings(),
          })
        }
      }),
    )
  }

  #createNotification(language: string): void {
    const { homey } = this
    const {
      manifest: { version },
      notifications,
      settings,
    } = homey
    if (settings.get('notifiedVersion') !== version) {
      const { [version]: versionChangelog = {} } = changelog as Record<
        string,
        object
      >
      if (language in versionChangelog) {
        homey.setTimeout(async () => {
          try {
            if (hasChangelogLanguage(versionChangelog, language)) {
              await notifications.createNotification({
                excerpt: versionChangelog[language],
              })
              settings.set('notifiedVersion', version)
            }
          } catch {}
        }, NOTIFICATION_DELAY)
      }
    }
  }

  #getDevices({
    ids,
  }: {
    ids?: string[]
  } = {}): HeatzyDevice[] {
    return Object.values(this.homey.drivers.getDrivers()).flatMap((driver) => {
      const devices = driver.getDevices()
      return ids === undefined ? devices : (
          devices.filter(({ id }) => ids.includes(id))
        )
    })
  }

  async #syncFromDevices({
    ids,
  }: {
    ids?: string[]
  } = {}): Promise<void> {
    await Promise.all(
      this.#getDevices({ ids }).map(async (device) => device.syncFromDevice()),
    )
  }
}
