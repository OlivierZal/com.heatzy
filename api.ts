import type Homey from 'homey/lib/Homey'
import type HeatzyApp from './app'
import { type LoginCredentials, type Settings } from './types'

module.exports = {
  async getLocale({ homey }: { homey: Homey }): Promise<string> {
    return homey.i18n.getLanguage()
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
