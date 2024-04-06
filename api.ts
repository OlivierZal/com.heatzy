import type {
  DeviceSettings,
  DriverSetting,
  LoginSetting,
  ManifestDriver,
  Settings,
  ValueOf,
} from './types'
import type HeatzyApp from './app'
import type HeatzyDevice from './drivers/heatzy/device'
import type Homey from 'homey/lib/Homey'
import type { LoginCredentials } from './heatzy/types'

const getDevices = (homey: Homey): HeatzyDevice[] =>
  Object.values(homey.drivers.getDrivers()).flatMap(
    driver => driver.getDevices() as HeatzyDevice[],
  )

const getDriverSettings = (
  driver: ManifestDriver,
  language: string,
): DriverSetting[] =>
  (driver.settings ?? []).flatMap(setting =>
    (setting.children ?? []).map(
      ({ id, max, min, label, type, units, values }) => ({
        driverId: driver.id,
        groupId: setting.id,
        groupLabel: setting.label[language],
        id,
        max,
        min,
        title: label[language],
        type,
        units,
        values: values?.map(value => ({
          id: value.id,
          label: value.label[language],
        })),
      }),
    ),
  )

const getDriverLoginSetting = (
  { id: driverId, pair }: ManifestDriver,
  language: string,
): DriverSetting[] => {
  const driverLoginSetting = pair?.find(
    (pairSetting): pairSetting is LoginSetting => pairSetting.id === 'login',
  )
  return driverLoginSetting
    ? Object.values(
      Object.entries(driverLoginSetting.options).reduce<
          Record<string, DriverSetting>
        >((acc, [option, label]) => {
          const isPassword = option.startsWith('password')
          const key = isPassword ? 'password' : 'username'
          if (!(key in acc)) {
            acc[key] = {
              driverId,
              groupId: 'login',
              id: key,
              title: '',
              type: isPassword ? 'password' : 'text',
            }
          }
          acc[key][option.endsWith('Placeholder') ? 'placeholder' : 'title']
            = label[language]
          return acc
        }, {}),
    )
    : []
}

export = {
  getDeviceSettings({ homey }: { homey: Homey }): DeviceSettings {
    return getDevices(homey).reduce<DeviceSettings>((acc, device) => {
      const driverId = device.driver.id
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
    const app = homey.app as HeatzyApp
    const language = homey.i18n.getLanguage()
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    return (app.manifest.drivers as ManifestDriver[]).flatMap((driver) => {
      const settings = getDriverSettings(driver, language)
      const loginSetting = getDriverLoginSetting(driver, language)
      return [...settings, ...loginSetting]
    })
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
    return (homey.app as HeatzyApp).heatzyAPI.applyLogin(body)
  },
  async setDeviceSettings<K extends keyof Settings>({
    homey,
    body,
  }: {
    body: Settings
    homey: Homey
  }): Promise<void> {
    await Promise.all(
      getDevices(homey).map(async (device) => {
        const changedKeys = (Object.keys(body) as K[]).filter(
          changedKey => body[changedKey] !== device.getSetting(changedKey),
        )
        if (changedKeys.length) {
          const deviceSettings = Object.fromEntries(
            changedKeys.map(key => [key, body[key]]),
          )
          await device.setSettings(deviceSettings)
          await device.onSettings({
            changedKeys,
            newSettings: device.getSettings() as Settings,
          })
        }
      }),
    )
  },
}
