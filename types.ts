import type HeatzyDevice from './drivers/heatzy/device'

export type Settings = Record<string, any>

export interface ManifestDriverSettingData {
  readonly id: string
  readonly label: Record<string, string>
  readonly type: string
  readonly min?: number
  readonly max?: number
  readonly units?: string
  readonly values?: Array<{ id: string; label: Record<string, string> }>
}

export interface ManifestDriverSetting {
  readonly label: Record<string, string>
  readonly id?: string
  readonly children?: ManifestDriverSettingData[]
}

export type PairSetting = { id: string } & Record<string, any>

export interface LoginSetting extends PairSetting {
  readonly id: 'login'
  readonly options: {
    readonly usernameLabel: Record<string, string>
    readonly usernamePlaceholder: Record<string, string>
    readonly passwordLabel: Record<string, string>
    readonly passwordPlaceholder: Record<string, string>
  }
}

export interface ManifestDriver {
  readonly id: string
  readonly capabilitiesOptions?: Record<
    string,
    { readonly title?: Record<string, string> }
  >
  readonly pair?: LoginSetting & PairSetting[]
  readonly settings?: ManifestDriverSetting[]
}

export interface DriverSetting {
  readonly id: string
  readonly type: string
  readonly driverId: string
  title: string
  readonly groupId?: string
  readonly groupLabel?: string
  readonly min?: number
  readonly max?: number
  readonly units?: string
  readonly values?: Array<{ id: string; label: string }>
  placeholder?: string
}

export type DeviceSettings = Record<string, Record<string, any[]>>

export type ModeNumber = 0 | 1 | 2 | 3

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

export type Mode = 'cft' | 'eco' | 'fro' | 'stop'

export type CapabilityValue = boolean | Mode

export interface DataError {
  error_message: string
}

export interface LoginCredentials {
  username: string
  password: string
}

export interface LoginDataSuccess {
  token: string
  expire_at: number
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

export type DevicePostData =
  | { raw: [1, 1, ModeNumber] }
  | {
      attrs: {
        mode: ModeNumber
      }
    }

export interface DeviceData {
  attr: {
    mode: ModeString
  }
}

export interface FlowArgs {
  readonly device: HeatzyDevice
  readonly mode: Mode
}
