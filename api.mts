import type { LoginPostData } from '@olivierzal/heatzy-api'
import type { Homey } from 'homey/lib/Homey'

import type { DeviceSettings, DriverSetting, Settings } from './types.mts'

const api = {
  getDeviceSettings({ homey }: { homey: Homey }): DeviceSettings {
    return homey.app.getDeviceSettings()
  },
  getDriverSettings({
    homey,
  }: {
    homey: Homey
  }): Partial<Record<string, DriverSetting[]>> {
    return homey.app.getDriverSettings()
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
    return homey.app.login(body)
  },
  async setDeviceSettings({
    body,
    homey,
  }: {
    body: Settings
    homey: Homey
  }): Promise<void> {
    return homey.app.setDeviceSettings(body)
  },
}

export default api
