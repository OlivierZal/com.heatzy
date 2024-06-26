import 'source-map-support/register'
import { App } from 'homey'
import HeatzyAPI from '@olivierzal/heatzy-api'
import { Settings as LuxonSettings } from 'luxon'

export = class HeatzyApp extends App {
  public readonly heatzyAPI = new HeatzyAPI({
    logger: {
      error: (...args): void => {
        this.error(...args)
      },
      log: (...args): void => {
        this.log(...args)
      },
    },
    settingManager: this.homey.settings,
  })

  public override async onInit(): Promise<void> {
    LuxonSettings.defaultLocale = this.homey.i18n.getLanguage()
    LuxonSettings.defaultZone = this.homey.clock.getTimezone()
    await this.heatzyAPI.applyLogin()
  }
}
