export const NUMBER_1 = 1

export interface APISettings {
  readonly expireAt?: number | null
  readonly password?: string | null
  readonly token?: string | null
  readonly username?: string | null
}

export enum Mode {
  cft = 0,
  eco = 1,
  fro = 2,
  stop = 3,
  cft1 = 4,
  cft2 = 5,
}

export enum DerogMode {
  off = 0,
  vacation = 1,
  boost = 2,
}

export enum Switch {
  off = 0,
  on = 1,
}

export type Data = Record<string, never>

export interface ErrorData {
  readonly detail_message: string | null
  readonly error_message: string | null
}

export interface LoginCredentials {
  readonly password: string
  readonly username: string
}

export interface LoginPostData {
  readonly password: string
  readonly username: string
}

export interface LoginData {
  readonly expire_at: number
  readonly token: string
}

export interface Bindings {
  readonly devices: readonly {
    readonly dev_alias: string
    readonly did: string
    readonly product_key: string
    readonly product_name: string
  }[]
}

interface FirstGenDevicePostData {
  readonly raw: [typeof NUMBER_1, typeof NUMBER_1, Mode]
}

export interface BaseAttrs {
  cft_tempH?: number
  cft_tempL?: number
  derog_mode?: DerogMode
  derog_time?: number
  lock_switch?: Switch
  mode?: Mode
  timer_switch?: Switch
}

interface DevicePostData {
  readonly attrs: BaseAttrs
}

export type DevicePostDataAny = DevicePostData | FirstGenDevicePostData

export interface DeviceData {
  readonly attr: Exclude<BaseAttrs, 'mode'> & { readonly mode: string }
}
