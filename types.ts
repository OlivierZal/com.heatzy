import type Homey from 'homey/lib/Homey'
import type BaseHeatzyDevice from './drivers/heatzy/device'

/* eslint-disable @typescript-eslint/no-explicit-any */
interface Loggable {
  /* eslint-disable @typescript-eslint/method-signature-style */
  error(...errorArgs: any[]): void
  log(...logArgs: any[]): void
  /* eslint-enable @typescript-eslint/method-signature-style */
}

export type LogClass = abstract new (...args: any[]) => Loggable

export type HomeyClass = new (...args: any[]) => Loggable & {
  readonly homey: Homey
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export type ModeNumber = 0 | 1 | 2 | 3 | 4 | 5
export type ModeString =
  | 'cft'
  | 'cft1'
  | 'cft2'
  | 'eco'
  | 'fro'
  | 'stop'
  | '停止' // 'stop'
  | '经济' // 'eco'
  | '舒适' // 'cft'
  | '解冻' // 'fro'

export type Mode = 'cft' | 'cft1' | 'cft2' | 'eco' | 'fro' | 'stop'

export type OnMode = Exclude<Mode, 'stop'> | 'previous'

export type CapabilityValue = boolean | number | string | null

type ValueOf<T> = T[keyof T]

export interface Settings {
  readonly always_on?: boolean
  readonly on_mode?: OnMode
}

export type SettingValue = ValueOf<Settings>

export interface HomeySettings {
  readonly username: string | null
  readonly password: string | null
  readonly token: string | null
  readonly expire_at: number | null
}

export type HomeySettingValue = ValueOf<HomeySettings>

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

export interface LoginCredentials {
  readonly password: string
  readonly username: string
}

export interface LoginDriverSetting extends DriverSetting {
  readonly id: keyof LoginCredentials
}

export type DeviceSetting = Record<string, SettingValue[]>
export type DeviceSettings = Record<string, DeviceSetting>

export interface Data {
  readonly error_message?: string
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
    readonly product_name: string
  }[]
}

export interface DeviceDetails {
  readonly data: {
    readonly id: string
    readonly productKey: string
    readonly productName?: string
  }
  readonly name: string
  readonly capabilities: string[]
}

export type Switch = 0 | 1

export interface BaseAttrs {
  readonly derog_mode?: 0 | 1 | 2
  readonly derog_time?: number
  readonly lock_switch?: Switch
  readonly mode?: ModeNumber
  readonly timer_switch?: Switch
}

export interface FirstGenDevicePostData {
  readonly raw: [1, 1, ModeNumber]
}

export interface DevicePostData {
  readonly attrs: BaseAttrs
}

export interface DeviceData {
  readonly attr: Omit<BaseAttrs, 'mode'> & { readonly mode: ModeString }
}

export interface FlowArgs {
  readonly device: BaseHeatzyDevice
  readonly mode: Mode
}
