import type Homey from 'homey/lib/Homey'
import { type Driver } from 'homey'
import type HeatzyApp from './app'
import type HeatzyDevice from './drivers/heatzy/device'
import {
  type DeviceSettings,
  type DriverSetting,
  type LoginCredentials,
  type LoginSetting,
  type ManifestDriver,
  type ManifestDriverSetting,
  type ManifestDriverSettingData,
  type PairSetting,
  type Settings
} from './types'

function getDevices(homey: Homey): HeatzyDevice[] {
  return Object.values(homey.drivers.getDrivers()).flatMap(
    (driver: Driver): HeatzyDevice[] => driver.getDevices() as HeatzyDevice[]
  )
}

function getLanguage(homey: Homey): string {
  return homey.i18n.getLanguage()
}

module.exports = {
  async getDeviceSettings({
    homey
  }: {
    homey: Homey
  }): Promise<DeviceSettings> {
    return getDevices(homey).reduce<DeviceSettings>(
      (deviceSettings, device) => {
        const driverId: string = device.driver.id
        if (deviceSettings[driverId] === undefined) {
          deviceSettings[driverId] = {}
        }
        Object.entries(device.getSettings()).forEach(
          ([settingId, value]: [string, any]) => {
            if (deviceSettings[driverId][settingId] === undefined) {
              deviceSettings[driverId][settingId] = []
            }
            if (!deviceSettings[driverId][settingId].includes(value)) {
              deviceSettings[driverId][settingId].push(value)
            }
          }
        )
        return deviceSettings
      },
      {}
    )
  },

  async getDriverSettings({
    homey
  }: {
    homey: Homey
  }): Promise<DriverSetting[]> {
    const app: HeatzyApp = homey.app as HeatzyApp
    const language: string = getLanguage(homey)
    const settings: DriverSetting[] = app.manifest.drivers.flatMap(
      (driver: ManifestDriver): DriverSetting[] =>
        (driver.settings ?? []).flatMap(
          (setting: ManifestDriverSetting): DriverSetting[] =>
            (setting.children ?? []).map(
              (child: ManifestDriverSettingData): DriverSetting => ({
                id: child.id,
                title: (driver.capabilitiesOptions?.[child.id]?.title ??
                  child.label)[language],
                type: child.type,
                min: child.min,
                max: child.max,
                units: child.units,
                values: child.values?.map(
                  (value: {
                    id: string
                    label: Record<string, string>
                  }): { id: string; label: string } => ({
                    id: value.id,
                    label: value.label[language]
                  })
                ),
                driverId: driver.id,
                groupId: setting.id,
                groupLabel: setting.label[language]
              })
            )
        )
    )
    const settingsLogin: DriverSetting[] = app.manifest.drivers.flatMap(
      (driver: ManifestDriver): DriverSetting[] => {
        const driverLoginSetting: LoginSetting | undefined = driver.pair?.find(
          (pairSetting: PairSetting): boolean => pairSetting.id === 'login'
        ) as LoginSetting | undefined
        if (driverLoginSetting === undefined) {
          return []
        }
        return Object.values(
          Object.entries(driverLoginSetting.options).reduce<
            Record<string, DriverSetting>
          >(
            (
              driverLoginSettings,
              [option, label]: [string, Record<string, string>]
            ) => {
              const isPassword: boolean = option.startsWith('password')
              const key: keyof LoginCredentials = isPassword
                ? 'password'
                : 'username'
              if (driverLoginSettings[key] === undefined) {
                driverLoginSettings[key] = {
                  groupId: 'login',
                  id: key,
                  title: '',
                  type: isPassword ? 'password' : 'text',
                  driverId: driver.id
                }
              }
              if (option.endsWith('Placeholder')) {
                driverLoginSettings[key].placeholder = label[language]
              } else {
                driverLoginSettings[key].title = label[language]
              }
              return driverLoginSettings
            },
            {}
          )
        )
      }
    )
    return [...settings, ...settingsLogin]
  },

  async getLanguage({ homey }: { homey: Homey }): Promise<string> {
    return getLanguage(homey)
  },

  async login({
    homey,
    body
  }: {
    homey: Homey
    body: LoginCredentials
  }): Promise<boolean> {
    return await (homey.app as HeatzyApp).login(body)
  },

  async setDeviceSettings({
    homey,
    body
  }: {
    homey: Homey
    body: Settings
  }): Promise<void> {
    const changedKeys: string[] = Object.keys(body)
    if (changedKeys.length === 0) {
      return
    }
    try {
      await Promise.all(
        getDevices(homey).map(async (device: HeatzyDevice): Promise<void> => {
          const deviceChangedKeys: string[] = changedKeys.filter(
            (changedKey: string): boolean =>
              body[changedKey] !== device.getSetting(changedKey)
          )
          if (deviceChangedKeys.length === 0) {
            return
          }
          const deviceSettings: Settings = Object.keys(body)
            .filter((key) => deviceChangedKeys.includes(key))
            .reduce<Settings>((settings, key: string) => {
              settings[key] = body[key]
              return settings
            }, {})
          try {
            await device.setSettings(deviceSettings).then((): void => {
              device.log('Setting:', deviceSettings)
            })
            await device.onSettings({
              newSettings: device.getSettings(),
              changedKeys: deviceChangedKeys
            })
          } catch (error: unknown) {
            const errorMessage: string =
              error instanceof Error ? error.message : String(error)
            device.error(errorMessage)
            throw new Error(errorMessage)
          }
        })
      )
    } catch (error: unknown) {
      throw new Error(error instanceof Error ? error.message : String(error))
    }
  }
}
