import type Homey from 'homey/lib/Homey'
import type HeatzyApp from './app'
import {
  type LoginCredentials,
  type Settings,
  type SettingsData
} from './types'

module.exports = {
  async getLocale({ homey }: { homey: Homey }): Promise<string> {
    return (homey.app as HeatzyApp).locale
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

  async getDeviceSettings({
    homey,
    query
  }: {
    homey: Homey
    query: { id?: string }
  }): Promise<SettingsData[]> {
    let settings: any = homey.app.manifest.drivers.flatMap(
      (driver: any): SettingsData[] =>
        driver.settings.flatMap((setting: any): any[] =>
          setting.children.map((child: any): any => ({
            id: child.id,
            driverId: driver.id,
            label: setting.label,
            title:
              driver?.capabilitiesOptions?.[child.id]?.title ?? child.label,
            min: child.min,
            max: child.max,
            type: child.type,
            units: child.units,
            values: child.values
          }))
        )
    )
    if (query.id !== undefined) {
      settings = settings.filter(
        (setting: SettingsData): boolean => setting.id === query.id
      )
    }
    return settings
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
