import type HeatzyDevice from './drivers/heatzy/device'

export type SettingValue = boolean | number | string | null | undefined

export type Settings = Record<string, SettingValue>

export interface ManifestDriverSettingData {
  readonly id: string
  readonly label: Record<string, string>
  readonly max?: number
  readonly min?: number
  readonly type: string
  readonly units?: string
  readonly values?: {
    readonly id: string
    readonly label: Record<string, string>
  }[]
}

export interface ManifestDriverSetting {
  readonly children?: ManifestDriverSettingData[]
  readonly id?: string
  readonly label: Record<string, string>
}

export interface PairSetting {
  readonly id: string
}

export interface LoginSetting extends PairSetting {
  readonly id: 'login'
  readonly options: {
    readonly passwordLabel: Record<string, string>
    readonly passwordPlaceholder: Record<string, string>
    readonly usernameLabel: Record<string, string>
    readonly usernamePlaceholder: Record<string, string>
  }
}

export interface ManifestDriver {
  readonly capabilitiesOptions?: Record<
    string,
    { readonly title?: Record<string, string> }
  >
  readonly id: string
  readonly pair?: LoginSetting & PairSetting[]
  readonly settings?: ManifestDriverSetting[]
}

export interface DriverSetting {
  readonly driverId: string
  readonly groupId?: string
  readonly groupLabel?: string
  readonly id: string
  readonly max?: number
  readonly min?: number
  placeholder?: string
  title: string
  readonly type: string
  readonly units?: string
  readonly values?: { readonly id: string; readonly label: string }[]
}

export type DeviceSetting = Record<string, SettingValue[]>

export type DeviceSettings = Record<string, DeviceSetting>

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

export interface Data {
  readonly error_message?: string
}

export interface LoginCredentials {
  readonly password: string
  readonly username: string
}

export interface LoginDataSuccess {
  readonly expire_at: number
  readonly token: string
}

export interface Bindings {
  readonly devices: {
    readonly dev_alias: string
    readonly did: string
    readonly product_key: string
  }[]
}

export interface DeviceDetails {
  readonly data: {
    readonly id: string
    readonly productKey: string
  }
  readonly name: string
}

export type DevicePostData =
  | { readonly raw: [1, 1, ModeNumber] }
  | {
      readonly attrs: {
        readonly mode: ModeNumber
      }
    }

export interface DeviceData {
  readonly attr: {
    readonly mode: ModeString
  }
}

export interface FlowArgs {
  readonly device: HeatzyDevice
  readonly mode: Mode
}
