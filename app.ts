import axios from 'axios'
import { App, type Driver } from 'homey'
import type HeatzyDevice from './drivers/heatzy/device'
import {
  type DeviceData,
  type Bindings,
  type DataError,
  type Device,
  type DeviceDetails,
  type DevicePostData,
  type LoginCredentials,
  type LoginDataSuccess,
  type ModeNumber,
  type ModeString,
  type Settings
} from './types'

function isPiloteFirstGen(productKey: string): boolean {
  return productKey === '9420ae048da545c88fc6274d204dd25f'
}

function formatDevicePostData(
  mode: ModeNumber,
  productKey: string
): DevicePostData {
  if (isPiloteFirstGen(productKey)) {
    return { raw: [1, 1, mode] }
  }
  return { attrs: { mode } }
}

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
      password: this.homey.settings.get('password') ?? ''
    }
    const expireAt: number | null = this.homey.settings.get('expire_at') * 1000
    if (expireAt !== null) {
      const expireAtDate: Date = new Date(expireAt)
      expireAtDate.setDate(expireAtDate.getDate() - 1)
      const ms: number = expireAtDate.getTime() - new Date().getTime()
      if (ms > 0) {
        const maxTimeout: number = Math.pow(2, 31) - 1
        const interval: number = Math.min(ms, maxTimeout)
        this.loginTimeout = this.homey.setTimeout(async (): Promise<void> => {
          await this.login(loginCredentials).catch(this.error)
        }, interval)
        this.log('Login refresh has been scheduled')
        return
      }
    }
    await this.login(loginCredentials).catch(this.error)
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
      const { data } = await axios.post<LoginDataSuccess | DataError>(
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
        password
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
            productKey: device.product_key
          }
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

  async getDeviceMode(device: HeatzyDevice): Promise<ModeString | null> {
    try {
      device.log('Syncing from device...')
      const { data } = await axios.get<DeviceData>(
        `devdata/${device.id}/latest`
      )
      device.log('Syncing from device:\n', data)
      return data.attr.mode
    } catch (error: unknown) {
      device.error(
        'Syncing from device:',
        error instanceof Error ? error.message : error
      )
    }
    return null
  }

  async setDeviceMode(
    device: HeatzyDevice,
    mode: ModeNumber
  ): Promise<boolean> {
    try {
      const postData: DevicePostData = formatDevicePostData(
        mode,
        device.productKey
      )
      device.log('Syncing with device...\n', postData)
      const { data } = await axios.post<any | DataError>(
        `/control/${device.id}`,
        postData
      )
      device.log('Syncing with device:\n', data)
      if ('error_message' in data) {
        throw new Error(data.error_message)
      }
      return true
    } catch (error: unknown) {
      device.error(
        'Syncing with device:',
        error instanceof Error ? error.message : error
      )
    }
    return false
  }

  async setDeviceSettings(settings: Settings): Promise<void> {
    const changedKeys: string[] = Object.keys(settings)
    if (changedKeys.length === 0) {
      return
    }
    try {
      await Promise.all(
        Object.values(this.homey.drivers.getDrivers())
          .flatMap((driver: Driver) => driver.getDevices() as HeatzyDevice[])
          .map(async (device: HeatzyDevice): Promise<void> => {
            try {
              await device.setSettings(settings).then((): void => {
                device.log(settings)
              })
              await device.onSettings({
                newSettings: device.getSettings(),
                changedKeys
              })
            } catch (error: unknown) {
              const errorMessage: string =
                error instanceof Error ? error.message : String(error)
              device.error(errorMessage)
              throw new Error(errorMessage)
            }
          })
      )
    } catch (error: unknown) {
      throw new Error(error instanceof Error ? error.message : String(error))
    }
  }

  setSettings(settings: Settings): void {
    Object.entries(settings).forEach(
      ([setting, value]: [string, any]): void => {
        if (value !== this.homey.settings.get(setting)) {
          this.homey.settings.set(setting, value)
        }
      }
    )
  }

  getLanguage(): string {
    return this.homey.i18n.getLanguage()
  }
}

module.exports = HeatzyApp
