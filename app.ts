import 'source-map-support/register'
import { App } from 'homey'
import HeatzyAPI from './heatzy/api'
import { Settings as LuxonSettings } from 'luxon'

export = class HeatzyApp extends App {
  public readonly heatzyAPI = new HeatzyAPI(this.homey.settings, this)

  public async onInit(): Promise<void> {
    LuxonSettings.defaultLocale = this.homey.i18n.getLanguage()
    LuxonSettings.defaultZone = this.homey.clock.getTimezone()
    await this.heatzyAPI.applyLogin()
  }
}
