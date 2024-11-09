import 'core-js/actual/object/group-by.js'
import 'source-map-support/register.js'

import {
  DeviceModel,
  FacadeManager,
  HeatzyAPI,
  type DeviceFacade,
  type LoginPostData,
} from '@olivierzal/heatzy-api'
import { Settings as LuxonSettings } from 'luxon'

import { Homey } from './homey.mjs'
import { changelog } from './jsonFiles.mjs'

import type HeatzyDevice from './drivers/heatzy/device.mjs'
import type {
  DeviceSettings,
  DriverSetting,
  LoginSetting,
  Manifest,
  ManifestDriver,
  Settings,
} from './types.mjs'

const NOTIFICATION_DELAY = 10000

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
): DriverSetting[] =>
  Object.values(
    Object.entries(
      pair?.find(
        (pairSetting): pairSetting is LoginSetting =>
          pairSetting.id === 'login',
      )?.options ?? [],
    ).reduce<Record<string, DriverSetting>>((acc, [option, label]) => {
      const isPassword = option.startsWith('password')
      const key = isPassword ? 'password' : 'username'
      acc[key] ??= {
        driverId,
        groupId: 'login',
        id: key,
        title: '',
        type: isPassword ? 'password' : 'text',
      }
      acc[key][option.endsWith('Placeholder') ? 'placeholder' : 'title'] =
        label[language] ?? label.en
      return acc
    }, {}),
  )

export default class HeatzyApp extends Homey.App {
  readonly #language = this.homey.i18n.getLanguage()

  #api!: HeatzyAPI

  #facadeManager!: FacadeManager

  public get api(): HeatzyAPI {
    return this.#api
  }

  public override async onInit(): Promise<void> {
    const timezone = this.homey.clock.getTimezone()
    LuxonSettings.defaultZone = timezone
    LuxonSettings.defaultLocale = this.#language
    this.#api = await HeatzyAPI.create({
      language: this.#language,
      logger: {
        error: (...args) => {
          this.error(...args)
        },
        log: (...args) => {
          this.log(...args)
        },
      },
      onSync: async () => this.#syncFromDevices(),
      settingManager: this.homey.settings,
      timezone,
    })
    this.#facadeManager = new FacadeManager(this.#api)
    this.#createNotification()
  }

  public override async onUninit(): Promise<void> {
    this.#api.clearSync()
    return Promise.resolve()
  }

  public getDeviceSettings(): DeviceSettings {
    return this.#getDevices().reduce<DeviceSettings>((acc, device) => {
      const {
        driver: { id: driverId },
      } = device
      acc[driverId] ??= {}
      for (const [id, value] of Object.entries(
        device.getSettings() as Settings,
      )) {
        if (!(id in acc[driverId])) {
          acc[driverId][id] = value
        } else if (acc[driverId][id] !== value) {
          acc[driverId][id] = null
          break
        }
      }
      return acc
    }, {})
  }

  public getDriverSettings(): Partial<Record<string, DriverSetting[]>> {
    return Object.groupBy(
      (this.homey.manifest as Manifest).drivers.flatMap((driver) => [
        ...getDriverSettings(driver, this.#language),
        ...getDriverLoginSetting(driver, this.#language),
      ]),
      ({ driverId, groupId }) => groupId ?? driverId,
    )
  }

  public getFacade(id: string): DeviceFacade {
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
            newSettings: device.getSettings() as Settings,
          })
        }
      }),
    )
  }

  #createNotification(): void {
    const { version } = this.homey.manifest as Manifest
    if (
      this.homey.settings.get('notifiedVersion') !== version &&
      version in changelog
    ) {
      const { [version as keyof typeof changelog]: versionChangelog } =
        changelog
      this.homey.setTimeout(async () => {
        try {
          await this.homey.notifications.createNotification({
            excerpt:
              versionChangelog[
                this.#language in versionChangelog ?
                  (this.#language as keyof typeof versionChangelog)
                : 'en'
              ],
          })
          this.homey.settings.set('notifiedVersion', version)
        } catch {}
      }, NOTIFICATION_DELAY)
    }
  }

  #getDevices(): HeatzyDevice[] {
    return Object.values(this.homey.drivers.getDrivers()).flatMap(
      (driver) => driver.getDevices() as HeatzyDevice[],
    )
  }

  async #syncFromDevices(): Promise<void> {
    await Promise.all(
      this.#getDevices().map(async (device) => device.syncFromDevice()),
    )
  }
}
