import type HeatzyDevice from './drivers/heatzy/device'

export type Settings = Record<string, any>

export interface ManifestDeviceSettingData {
  id: string
  label: Record<string, string>
  min?: number
  max?: number
  type: string
  units?: string
  values?: Array<{ id: string; label: Record<string, string> }>
}

export interface ManifestDeviceSetting {
  label: Record<string, string>
  children: ManifestDeviceSettingData[]
}

export interface ManifestDevice {
  id: string
  capabilitiesOptions?: Record<string, { title?: Record<string, string> }>
  settings?: ManifestDeviceSetting[]
}

export interface DeviceSetting {
  id: string
  group: string
  groupLabel: string
  title: string
  type: string
  min?: number
  max?: number
  units?: string
  values?: Array<{ id: string; label: string }>
}

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
