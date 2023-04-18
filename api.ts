import type Homey from 'homey/lib/Homey'
import type HeatzyApp from './app'
import {
  type DeviceSetting,
  type LoginCredentials,
  type ManifestDevice,
  type ManifestDeviceSetting,
  type ManifestDeviceSettingData,
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
    return app.manifest.drivers.flatMap(
      (driver: ManifestDevice): DeviceSetting[] =>
        (driver.settings ?? []).flatMap(
          (setting: ManifestDeviceSetting): DeviceSetting[] =>
            (setting.children ?? []).map(
              (child: ManifestDeviceSettingData): DeviceSetting => ({
                id: child.id,
                groupId: setting.id,
                groupLabel: setting.label[language],
                title: (driver.capabilitiesOptions?.[child.id]?.title ??
                  child.label)[language],
                min: child.min,
                max: child.max,
                type: child.type,
                units: child.units,
                values: (child.values ?? []).map(
                  (value: {
                    id: string
                    label: Record<string, string>
                  }): { id: string; label: string } => ({
                    id: value.id,
                    label: value.label[language]
                  })
                )
              })
            )
        )
    )
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
  }): Promise<boolean> {
    return await (homey.app as HeatzyApp).setDeviceSettings(body)
  }
}
