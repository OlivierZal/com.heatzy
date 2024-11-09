import type { LoginPostData } from '@olivierzal/heatzy-api'
import type Homey from 'homey/lib/Homey'

import type HeatzyApp from './app.mjs'
import type { DeviceSettings, DriverSetting, Settings } from './types.mjs'

const getApp = (homey: Homey): HeatzyApp => homey.app as HeatzyApp

const api = {
  getDeviceSettings({ homey }: { homey: Homey }): DeviceSettings {
    return getApp(homey).getDeviceSettings()
  },
  getDriverSettings({
    homey,
  }: {
    homey: Homey
  }): Partial<Record<string, DriverSetting[]>> {
    return getApp(homey).getDriverSettings()
  },
  getLanguage({ homey }: { homey: Homey }): string {
    return homey.i18n.getLanguage()
  },
  async login({
    body,
    homey,
  }: {
    body: LoginPostData
    homey: Homey
  }): Promise<boolean> {
    return getApp(homey).login(body)
  },
  async setDeviceSettings({
    body,
    homey,
  }: {
    body: Settings
    homey: Homey
  }): Promise<void> {
    return getApp(homey).setDeviceSettings(body)
  },
}

export default api
