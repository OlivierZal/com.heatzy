export type Settings = Record<string, any>

export type Mode = 'cft' | 'eco' | 'fro' | 'stop'
export type CapabilityValue = boolean | Mode

export interface LoginPostData {
  username: string
  password: string
}

export interface LoginDataSuccess {
  token: string
  expire_at: number
}

export interface DataError {
  error_message: string
}

export interface Device {
  readonly dev_alias: string
  readonly did: string
  readonly product_key: string
}

export interface Bindings {
  readonly devices: Device[]
}

export interface DeviceDetails {
  readonly name: string
  readonly data: {
    readonly id: string
    readonly productKey: string
  }
}

export type ModeNumber = 0 | 1 | 2 | 3

export type DevicePostData =
  | { raw: [1, 1, ModeNumber] }
  | {
      attrs: {
        mode: ModeNumber
      }
    }

export type ModeString =
  | 'cft'
  | 'eco'
  | 'fro'
  | 'stop'
  | 'cft1'
  | 'cft2'
  | '舒适' // 'cft'
  | '经济' // 'eco'
  | '解冻' // 'fro'
  | '停止' // 'stop'

export interface DeviceData {
  attr: {
    mode: ModeString
  }
}
