import 'source-map-support/register'
import { App } from 'homey' // eslint-disable-line import/no-extraneous-dependencies
import axios from 'axios'
import withAPI from './mixins/withAPI'
import type {
  Data,
  HomeySettings,
  HomeySettingValue,
  LoginCredentials,
  LoginDataSuccess,
} from './types'

axios.defaults.baseURL = 'https://euapi.gizwits.com/app'
axios.defaults.headers.common['X-Gizwits-Application-Id'] =
  'c70a66ff039d41b4a220e198b0fcc8b3'

export = class HeatzyApp extends withAPI(App) {
  #loginTimeout!: NodeJS.Timeout

  public async  onInit(): Promise<void> {
    await this.refreshLogin()
  }

  public async login(postData: LoginCredentials): Promise<boolean> {
    this.clearLoginRefresh()
    try {
      const { username, password } = postData
      if (!username || !password) {
        return false
      }
      const { data } = await this.api.post<LoginDataSuccess | Required<Data>>(
        '/login',
        postData,
      )
      if ('error_message' in data) {
        throw new Error(data.error_message)
      }
      const { token, expire_at } = data // eslint-disable-line camelcase
      this.setSettings({
        token,
        expire_at, // eslint-disable-line camelcase
        username,
        password,
      })
      await this.refreshLogin()
      return true
    } catch (error: unknown) {
      throw new Error(error instanceof Error ? error.message : String(error))
    }
  }

  private async refreshLogin(): Promise<void> {
    const loginCredentials: LoginCredentials = {
      username:
        (this.homey.settings.get('username') as HomeySettings['username']) ??
        '',
      password:
        (this.homey.settings.get('password') as HomeySettings['password']) ??
        '',
    }
    const expiredAt: number | null = this.homey.settings.get(
      'expire_at',
    ) as HomeySettings['expire_at']
    if (expiredAt !== null) {
      const expireAtDate: Date = new Date(expiredAt * 1000)
      expireAtDate.setDate(expireAtDate.getDate() - 1)
      const ms: number = expireAtDate.getTime() - new Date().getTime()
      if (ms) {
        const maxTimeout: number = 2 ** 31 - 1
        const interval: number = Math.min(ms, maxTimeout)
        this.#loginTimeout = this.homey.setTimeout(async (): Promise<void> => {
          await this.tryLogin(loginCredentials)
        }, interval)
        this.log('Login refresh has been scheduled')
        return
      }
    }
    await this.tryLogin(loginCredentials)
  }

  private async tryLogin(loginCredentials: LoginCredentials): Promise<void> {
    try {
      await this.login(loginCredentials)
    } catch (error: unknown) {
      this.error(error instanceof Error ? error.message : error)
    }
  }

  private clearLoginRefresh(): void {
    this.homey.clearTimeout(this.#loginTimeout)
    this.log('Login refresh has been paused')
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
