import 'source-map-support/register.js'
import 'core-js/actual/object/group-by.js'

import {
  DeviceModel,
  FacadeManager,
  HeatzyAPI,
  type IDeviceFacadeAny,
  type LoginPostData,
} from '@olivierzal/heatzy-api'
// eslint-disable-next-line import/default, import/no-extraneous-dependencies
import Homey from 'homey'

import { changelog } from './json-files.mts'

import type HeatzyDevice from './drivers/heatzy/device.mts'
import type {
  DeviceSettings,
  DriverSetting,
  LoginSetting,
  ManifestDriver,
  Settings,
} from './types.mts'

const NOTIFICATION_DELAY = 10000

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
      acc[key] = {
        ...acc[key],
        [option.endsWith('Placeholder') ? 'placeholder' : 'title']:
          label[language] ?? label.en,
      }
      return acc
    }, {}),
  )

// eslint-disable-next-line import/no-named-as-default-member
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
      onSync: async (params) => this.#syncFromDevices(params),
      settingManager: this.homey.settings,
      timezone: this.homey.clock.getTimezone(),
    })
    this.#facadeManager = new FacadeManager(this.#api)
    this.#createNotification(language)
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
      for (const [id, value] of Object.entries(device.getSettings())) {
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
    const {
      homey: {
        manifest: { version },
      },
    } = this
    if (this.homey.settings.get('notifiedVersion') !== version) {
      const { [version]: versionChangelog = {} } = changelog
      if (language in versionChangelog) {
        this.homey.setTimeout(async () => {
          try {
            if (hasChangelogLanguage(versionChangelog, language)) {
              await this.homey.notifications.createNotification({
                excerpt: versionChangelog[language],
              })
              this.homey.settings.set('notifiedVersion', version)
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
