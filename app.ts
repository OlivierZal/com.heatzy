import 'source-map-support/register'
import { App } from 'homey'
import HeatzyAPI from './lib/HeatzyAPI'
import type { LoginCredentials } from './types/types'
import { Settings as LuxonSettings } from 'luxon'

export = class HeatzyApp extends App {
  public readonly heatzyAPI: HeatzyAPI = new HeatzyAPI(
    this.homey.settings,
    this.log.bind(this),
    this.error.bind(this),
  )

  public async onInit(): Promise<void> {
    LuxonSettings.defaultLocale = this.homey.i18n.getLanguage()
    LuxonSettings.defaultZone = this.homey.clock.getTimezone()
    await this.heatzyAPI.planRefreshLogin()
  }

  public async login(
    { password, username }: LoginCredentials,
    raise = false,
  ): Promise<boolean> {
    if (username && password) {
      try {
        await this.heatzyAPI.login({ password, username })
        return true
      } catch (error: unknown) {
        if (raise) {
          throw new Error(
            error instanceof Error ? error.message : String(error),
          )
        }
      }
    }
    return false
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  public async onUninit(): Promise<void> {
    this.heatzyAPI.clearLoginRefresh()
  }
}
