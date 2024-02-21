import 'source-map-support/register'
import { App } from 'homey'
import HeatzyAPI from './lib/HeatzyAPI'
import type { LoginCredentials } from './types/HeatzyAPITypes'
import { Settings as LuxonSettings } from 'luxon'

export = class HeatzyApp extends App {
  public readonly heatzyAPI: HeatzyAPI = new HeatzyAPI(
    this.homey.settings,
    this.log.bind(this),
    this.error.bind(this),
  )

  public async login(
    { password, username }: LoginCredentials,
    raise = false,
  ): Promise<boolean> {
    return this.heatzyAPI.applyLogin({ password, username }, raise)
  }

  public async onInit(): Promise<void> {
    LuxonSettings.defaultLocale = this.homey.i18n.getLanguage()
    LuxonSettings.defaultZone = this.homey.clock.getTimezone()
    await this.heatzyAPI.applyLogin()
  }
}
