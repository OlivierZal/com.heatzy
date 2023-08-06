import type { Driver } from 'homey'
import type Homey from 'homey/lib/Homey'
import type HeatzyApp from './app'
import type HeatzyDevice from './drivers/heatzy/device'
import type {
  DeviceSettings,
  DriverSetting,
  LoginCredentials,
  LoginSetting,
  ManifestDriver,
  ManifestDriverSetting,
  ManifestDriverSettingData,
  PairSetting,
  Settings,
  SettingValue,
} from './types'

function getDevices(homey: Homey): HeatzyDevice[] {
  return Object.values(homey.drivers.getDrivers()).flatMap(
    (driver: Driver): HeatzyDevice[] => driver.getDevices() as HeatzyDevice[]
  )
}

function getLanguage(homey: Homey): string {
  return homey.i18n.getLanguage()
}

export default {
  getDeviceSettings({ homey }: { homey: Homey }): DeviceSettings {
    return getDevices(homey).reduce<DeviceSettings>(
      (deviceSettings, device) => {
        const driverId: string = device.driver.id
        const newDeviceSettings: DeviceSettings = { ...deviceSettings }
        if (!(driverId in newDeviceSettings)) {
          newDeviceSettings[driverId] = {}
        }
        Object.entries(device.getSettings() as Settings).forEach(
          ([settingId, value]: [string, SettingValue]): void => {
            if (!(settingId in newDeviceSettings[driverId])) {
              newDeviceSettings[driverId][settingId] = []
            }
            if (!newDeviceSettings[driverId][settingId].includes(value)) {
              newDeviceSettings[driverId][settingId].push(value)
            }
          }
        )
        return newDeviceSettings
      },
      {}
    )
  },

  getDriverSettings({ homey }: { homey: Homey }): DriverSetting[] {
    const app: HeatzyApp = homey.app as HeatzyApp
    const language: string = getLanguage(homey)
    const settings: DriverSetting[] = app.manifest.drivers.flatMap(
      (driver: ManifestDriver): DriverSetting[] =>
        (driver.settings ?? []).flatMap(
          (setting: ManifestDriverSetting): DriverSetting[] =>
            (setting.children ?? []).map(
              (child: ManifestDriverSettingData): DriverSetting => ({
                id: child.id,
                title: child.label[language],
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
                    label: value.label[language],
                  })
                ),
                driverId: driver.id,
                groupId: setting.id,
                groupLabel: setting.label[language],
              })
            )
        )
    )
    const settingsLogin: DriverSetting[] = app.manifest.drivers.flatMap(
      (driver: ManifestDriver): DriverSetting[] => {
        const driverLoginSetting: LoginSetting | undefined = driver.pair?.find(
          (pairSetting: LoginSetting | PairSetting): boolean =>
            pairSetting.id === 'login'
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
              const newDriverLoginSettings: Record<string, DriverSetting> = {
                ...driverLoginSettings,
              }
              if (!(key in newDriverLoginSettings)) {
                newDriverLoginSettings[key] = {
                  groupId: 'login',
                  id: key,
                  title: '',
                  type: isPassword ? 'password' : 'text',
                  driverId: driver.id,
                }
              }
              newDriverLoginSettings[key][
                option.endsWith('Placeholder') ? 'placeholder' : 'title'
              ] = label[language]
              return newDriverLoginSettings
            },
            {}
          )
        )
      }
    )
    return [...settings, ...settingsLogin]
  },

  getLanguage({ homey }: { homey: Homey }): string {
    return getLanguage(homey)
  },

  async login({
    homey,
    body,
  }: {
    body: LoginCredentials
    homey: Homey
  }): Promise<boolean> {
    return (homey.app as HeatzyApp).login(body)
  },

  async setDeviceSettings({
    homey,
    body,
  }: {
    body: Settings
    homey: Homey
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
          const deviceSettings: Settings = deviceChangedKeys.reduce<Settings>(
            (settings, key: string) => ({ ...settings, [key]: body[key] }),
            {}
          )
          try {
            await device.setSettings(deviceSettings).then((): void => {
              device.log('Setting:', deviceSettings)
            })
            await device.onSettings({
              newSettings: device.getSettings(),
              changedKeys: deviceChangedKeys,
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
  },
}
