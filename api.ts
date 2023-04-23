import type Homey from 'homey/lib/Homey'
import type HeatzyApp from './app'
import {
  type DeviceSetting,
  type LoginCredentials,
  type ManifestDevice,
  type ManifestDeviceSetting,
  type ManifestDeviceSettingData,
  type PairSetting,
  type Settings
} from './types'

module.exports = {
  async getDeviceSettings({
    homey
  }: {
    homey: Homey
  }): Promise<DeviceSetting[]> {
    const app: HeatzyApp = homey.app as HeatzyApp
    const language: string = app.getLanguage()
    const settings: DeviceSetting[] = app.manifest.drivers.flatMap(
      (driver: ManifestDevice): DeviceSetting[] =>
        (driver.settings ?? []).flatMap(
          (setting: ManifestDeviceSetting): DeviceSetting[] =>
            (setting.children ?? []).map(
              (child: ManifestDeviceSettingData): DeviceSetting => ({
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
    const settingsLogin: DeviceSetting[] = app.manifest.drivers.flatMap(
      (driver: ManifestDevice): DeviceSetting[] => {
        const driverPairSetting: PairSetting | undefined = driver.pair?.find(
          (pairSetting: PairSetting): boolean => pairSetting.id === 'login'
        )
        if (driverPairSetting === undefined) {
          return []
        }
        const driverLoginSettings: DeviceSetting[] = Object.values(
          Object.entries(driverPairSetting.options ?? {}).reduce<
            Record<string, DeviceSetting>
          >((acc, [option, label]: [string, Record<string, string>]) => {
            const isPassword: boolean = option.startsWith('password')
            const key: 'password' | 'username' = isPassword
              ? 'password'
              : 'username'
            if (!(key in acc)) {
              acc[key] = {
                groupId: 'login',
                id: key,
                title: '',
                type: isPassword ? 'password' : 'text',
                driverId: driver.id
              }
            }
            if (option.endsWith('Placeholder')) {
              acc[key].placeholder = label[language]
            } else {
              acc[key].title = label[language]
            }
            return acc
          }, {})
        )
        return driverLoginSettings
      }
    )
    return [...settings, ...settingsLogin]
  },

  async getLanguage({ homey }: { homey: Homey }): Promise<string> {
    return (homey.app as HeatzyApp).getLanguage()
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
    await (homey.app as HeatzyApp).setDeviceSettings(body)
  }
}
