import 'source-map-support/register'
import { App } from 'homey'
import HeatzyAPI from './heatzy/api'
import type { LoginCredentials } from './heatzy/types'
import { Settings as LuxonSettings } from 'luxon'

export = class HeatzyApp extends App {
  public readonly heatzyAPI: HeatzyAPI = new HeatzyAPI(
    this.homey.settings,
    this.log.bind(this),
    this.error.bind(this),
  )

  public async applyLogin(
    data?: LoginCredentials,
    raise = false,
  ): Promise<boolean> {
    return this.heatzyAPI.applyLogin(data, raise)
  }

  public async onInit(): Promise<void> {
    LuxonSettings.defaultLocale = this.homey.i18n.getLanguage()
    LuxonSettings.defaultZone = this.homey.clock.getTimezone()
    await this.applyLogin()
  }
}
