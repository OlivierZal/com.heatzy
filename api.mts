import type { LoginPostData } from '@olivierzal/heatzy-api'
import type { Homey } from 'homey/lib/Homey'

import type { DeviceSettings, DriverSetting, Settings } from './types.mts'

const api = {
  getDeviceSettings({ homey: { app } }: { homey: Homey }): DeviceSettings {
    return app.getDeviceSettings()
  },
  getDriverSettings({
    homey: { app },
  }: {
    homey: Homey
  }): Partial<Record<string, DriverSetting[]>> {
    return app.getDriverSettings()
  },
  getLanguage({ homey: { i18n } }: { homey: Homey }): string {
    return i18n.getLanguage()
  },
  async login({
    body,
    homey: { app },
  }: {
    body: LoginPostData
    homey: Homey
  }): Promise<boolean> {
    return app.login(body)
  },
  async setDeviceSettings({
    body,
    homey: { app },
  }: {
    body: Settings
    homey: Homey
  }): Promise<void> {
    return app.setDeviceSettings(body)
  },
}

export default api
