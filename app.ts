import { App } from 'homey'
import axios from 'axios'
import type {
  Bindings,
  Data,
  Device,
  DeviceDetails,
  LoginCredentials,
  LoginDataSuccess,
  SettingValue,
  Settings,
} from './types'

export default class HeatzyApp extends App {
  loginTimeout!: NodeJS.Timeout

  async onInit(): Promise<void> {
    axios.defaults.baseURL = 'https://euapi.gizwits.com/app'
    axios.defaults.headers.common['X-Gizwits-Application-Id'] =
      'c70a66ff039d41b4a220e198b0fcc8b3'
    axios.defaults.headers.common['X-Gizwits-User-token'] =
      this.homey.settings.get('token') ?? ''

    await this.refreshLogin()
  }

  async refreshLogin(): Promise<void> {
    this.clearLoginRefresh()
    const loginCredentials: LoginCredentials = {
      username: this.homey.settings.get('username') ?? '',
      password: this.homey.settings.get('password') ?? '',
    }
    const expireAtDate: Date = new Date(
      this.homey.settings.get('expire_at') * 1000
    )
    expireAtDate.setDate(expireAtDate.getDate() - 1)
    const ms: number = expireAtDate.getTime() - new Date().getTime()
    if (ms > 0) {
      const maxTimeout: number = 2 ** 31 - 1
      const interval: number = Math.min(ms, maxTimeout)
      this.loginTimeout = this.homey.setTimeout(async (): Promise<void> => {
        await this.login(loginCredentials).catch((err: Error): void => {
          this.error(err.message)
        })
      }, interval)
      this.log('Login refresh has been scheduled')
      return
    }
    await this.login(loginCredentials).catch((err: Error): void => {
      this.error(err.message)
    })
  }

  clearLoginRefresh(): void {
    this.homey.clearTimeout(this.loginTimeout)
    this.log('Login refresh has been paused')
  }

  async login(postData: LoginCredentials): Promise<boolean> {
    try {
      const { username, password } = postData
      if (username === '' || password === '') {
        return false
      }
      this.log('Login...\n', postData)
      const { data } = await axios.post<LoginDataSuccess | Required<Data>>(
        '/login',
        postData
      )
      this.log('Login:\n', data)
      if ('error_message' in data) {
        throw new Error(data.error_message)
      }
      axios.defaults.headers.common['X-Gizwits-User-token'] = data.token
      this.setSettings({
        token: data.token,
        expire_at: data.expire_at,
        username,
        password,
      })
      await this.refreshLogin()
      return true
    } catch (error: unknown) {
      const errorMessage: string =
        error instanceof Error ? error.message : String(error)
      this.error('Login:', errorMessage)
      throw new Error(errorMessage)
    }
  }

  async listDevices(): Promise<DeviceDetails[]> {
    try {
      this.log('Searching for devices...')
      const { data } = await axios.get<Bindings>('/bindings')
      this.log('Searching for devices:\n', data)
      return data.devices.map(
        (device: Device): DeviceDetails => ({
          name: device.dev_alias,
          data: {
            id: device.did,
            productKey: device.product_key,
          },
        })
      )
    } catch (error: unknown) {
      this.error(
        'Searching for devices:',
        error instanceof Error ? error.message : error
      )
    }
    return []
  }

  setSettings(settings: Settings): void {
    Object.entries(settings).forEach(
      ([setting, value]: [string, SettingValue]): void => {
        if (value !== this.homey.settings.get(setting)) {
          this.homey.settings.set(setting, value)
        }
      }
    )
  }
}

module.exports = HeatzyApp
