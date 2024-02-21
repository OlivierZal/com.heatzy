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
  ValueOf,
} from './types/types'
import type { Driver } from 'homey'
import type HeatzyApp from './app'
import type HeatzyDevice from './drivers/heatzy/device'
import type Homey from 'homey/lib/Homey'

const getDevices = (homey: Homey): HeatzyDevice[] =>
  Object.values(homey.drivers.getDrivers()).flatMap(
    (driver: Driver): HeatzyDevice[] => driver.getDevices() as HeatzyDevice[],
  )

const getDriverSettings = (
  driver: ManifestDriver,
  language: string,
): DriverSetting[] =>
  (driver.settings ?? []).flatMap(
    (setting: ManifestDriverSetting): DriverSetting[] =>
      (setting.children ?? []).map(
        (child: ManifestDriverSettingData): DriverSetting => ({
          driverId: driver.id,
          groupId: setting.id,
          groupLabel: setting.label[language],
          id: child.id,
          max: child.max,
          min: child.min,
          title: child.label[language],
          type: child.type,
          units: child.units,
          values: child.values?.map(
            (value: {
              id: string
              label: Record<string, string>
            }): { id: string; label: string } => ({
              id: value.id,
              label: value.label[language],
            }),
          ),
        }),
      ),
  )

const getDriverLoginSetting = (
  driver: ManifestDriver,
  language: string,
): DriverSetting[] => {
  const driverLoginSetting: LoginSetting | undefined = driver.pair?.find(
    (pairSetting: PairSetting): pairSetting is LoginSetting =>
      pairSetting.id === 'login',
  )
  return driverLoginSetting
    ? Object.values(
        Object.entries(driverLoginSetting.options).reduce<
          Record<string, DriverSetting>
        >((acc, [option, label]: [string, Record<string, string>]) => {
          const isPassword: boolean = option.startsWith('password')
          const key: keyof LoginCredentials = isPassword
            ? 'password'
            : 'username'
          if (!(key in acc)) {
            acc[key] = {
              driverId: driver.id,
              groupId: 'login',
              id: key,
              title: '',
              type: isPassword ? 'password' : 'text',
            }
          }
          acc[key][option.endsWith('Placeholder') ? 'placeholder' : 'title'] =
            label[language]
          return acc
        }, {}),
      )
    : []
}

export = {
  getDeviceSettings({ homey }: { homey: Homey }): DeviceSettings {
    return getDevices(homey).reduce<DeviceSettings>((acc, device) => {
      const driverId: string = device.driver.id
      if (!(driverId in acc)) {
        acc[driverId] = {}
      }
      Object.entries(device.getSettings() as Settings).forEach(
        ([settingId, value]: [string, ValueOf<Settings>]) => {
          if (!(settingId in acc[driverId])) {
            acc[driverId][settingId] = []
          }
          if (!acc[driverId][settingId].includes(value)) {
            acc[driverId][settingId].push(value)
          }
        },
      )
      return acc
    }, {})
  },
  getDriverSettings({ homey }: { homey: Homey }): DriverSetting[] {
    const app: HeatzyApp = homey.app as HeatzyApp
    const language: string = homey.i18n.getLanguage()
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    return (app.manifest.drivers as ManifestDriver[]).flatMap(
      (driver: ManifestDriver): DriverSetting[] => {
        const settings = getDriverSettings(driver, language)
        const loginSetting = getDriverLoginSetting(driver, language)
        return [...settings, ...loginSetting]
      },
    )
  },
  getLanguage({ homey }: { homey: Homey }): string {
    return homey.i18n.getLanguage()
  },
  async login({
    homey,
    body,
  }: {
    body: LoginCredentials
    homey: Homey
  }): Promise<boolean> {
    return (homey.app as HeatzyApp).login(body, true)
  },
  async setDeviceSettings<K extends keyof Settings>({
    homey,
    body,
  }: {
    body: Settings
    homey: Homey
  }): Promise<void> {
    try {
      await Promise.all(
        getDevices(homey).map(async (device: HeatzyDevice): Promise<void> => {
          const changedKeys: K[] = (Object.keys(body) as K[]).filter(
            (changedKey: K) =>
              body[changedKey] !== device.getSetting(changedKey),
          )
          if (changedKeys.length) {
            const deviceSettings: Settings = Object.fromEntries(
              changedKeys.map((key: K): [K, Settings[K]] => [key, body[key]]),
            )
            try {
              await device.setSettings(deviceSettings)
              await device.onSettings({
                changedKeys,
                newSettings: device.getSettings() as Settings,
              })
            } catch (error: unknown) {
              const errorMessage: string =
                error instanceof Error ? error.message : String(error)
              device.error('Settings:', errorMessage)
              throw new Error(errorMessage)
            }
          }
        }),
      )
    } catch (error: unknown) {
      throw new Error(error instanceof Error ? error.message : String(error))
    }
  },
}
