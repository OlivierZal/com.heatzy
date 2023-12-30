import 'source-map-support/register'
import { App } from 'homey' // eslint-disable-line import/no-extraneous-dependencies
import axios from 'axios'
import { DateTime, Duration, Settings as LuxonSettings } from 'luxon'
import withAPI, { getErrorMessage } from './mixins/withAPI'
import type {
  HomeySettings,
  HomeySettingValue,
  LoginCredentials,
  LoginData,
} from './types'

const MAX_INT32: number = 2 ** 31 - 1

axios.defaults.baseURL = 'https://euapi.gizwits.com/app'
axios.defaults.headers.common['X-Gizwits-Application-Id'] =
  'c70a66ff039d41b4a220e198b0fcc8b3'

export = class HeatzyApp extends withAPI(App) {
  public retry = true

  #loginTimeout!: NodeJS.Timeout

  readonly #retryTimeout!: NodeJS.Timeout

  public async onInit(): Promise<void> {
    LuxonSettings.defaultLocale = this.getLanguage()
    LuxonSettings.defaultZone = this.homey.clock.getTimezone()
    await this.planRefreshLogin()
  }

  public async login(
    postData: LoginCredentials = {
      username:
        (this.homey.settings.get('username') as HomeySettings['username']) ??
        '',
      password:
        (this.homey.settings.get('password') as HomeySettings['password']) ??
        '',
    },
    raise = false,
  ): Promise<boolean> {
    this.clearLoginRefresh()
    try {
      const { username, password } = postData
      if (!username || !password) {
        return false
      }
      const { data } = await this.api.post<LoginData>(this.loginURL, postData)
      const { token, expire_at: expireAt } = data
      this.setSettings({ username, password, token, expireAt })
      await this.planRefreshLogin()
      return true
    } catch (error: unknown) {
      if (raise) {
        throw new Error(getErrorMessage(error))
      }
      return false
    }
  }

  public getLanguage(): string {
    return this.homey.i18n.getLanguage()
  }

  public handleRetry(): void {
    this.retry = false
    this.homey.clearTimeout(this.#retryTimeout)
    this.homey.setTimeout(
      () => {
        this.retry = true
      },
      Duration.fromObject({ minutes: 1 }).as('milliseconds'),
    )
  }

  private async planRefreshLogin(): Promise<void> {
    const expiredAt: number =
      (this.homey.settings.get('expireAt') as HomeySettings['expireAt']) ?? 0
    const ms: number = DateTime.fromSeconds(expiredAt)
      .minus({ days: 1 })
      .diffNow()
      .as('milliseconds')
    if (ms > 0) {
      this.#loginTimeout = this.homey.setTimeout(
        async (): Promise<void> => {
          await this.login()
        },
        Math.min(ms, MAX_INT32),
      )
      return
    }
    await this.login()
  }

  private clearLoginRefresh(): void {
    this.homey.clearTimeout(this.#loginTimeout)
  }

  private setSettings(settings: Partial<HomeySettings>): void {
    Object.entries(settings)
      .filter(
        ([setting, value]: [string, HomeySettingValue]) =>
          value !== this.homey.settings.get(setting),
      )
      .forEach(([setting, value]: [string, HomeySettingValue]): void => {
        this.homey.settings.set(setting, value)
      })
  }
}
