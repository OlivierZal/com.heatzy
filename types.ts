import type { SimpleClass } from 'homey'
import type Homey from 'homey/lib/Homey'
import type HeatzyDevice from './drivers/heatzy/device'

export const loginURL = '/login'

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
export type HomeyClass = new (...args: any[]) => SimpleClass & {
  readonly homey: Homey
  readonly setWarning?: (warning: string | null) => Promise<void>
}

type ModeString =
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

export enum Mode {
  cft = 0,
  eco = 1,
  fro = 2,
  stop = 3,
  cft1 = 4,
  cft2 = 5,
}

export type OnMode = Exclude<keyof typeof Mode, 'stop'>

export type PreviousMode = OnMode | 'previous'

export type CapabilityValue = boolean | number | string | null

type ValueOf<T> = T[keyof T]

export interface Settings {
  readonly always_on?: boolean
  readonly on_mode?: PreviousMode
}

export type SettingValue = ValueOf<Settings>

interface BaseHomeySettingValue<T1, T2> {
  readonly username: T1
  readonly password: T1
  readonly token: T1
  readonly expire_at: T2
}

export type HomeySettings = BaseHomeySettingValue<string | null, number | null>

export type HomeySettingsUI = BaseHomeySettingValue<
  string | undefined,
  number | undefined
>

export type HomeySettingValue = ValueOf<HomeySettings>

export interface ManifestDriverSettingData {
  readonly id: string
  readonly label: Record<string, string>
  readonly max?: number
  readonly min?: number
  readonly type: string
  readonly units?: string
  readonly values?: readonly {
    readonly id: string
    readonly label: Record<string, string>
  }[]
}

export interface ManifestDriverSetting {
  readonly children?: readonly ManifestDriverSettingData[]
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
  readonly pair?: LoginSetting & readonly PairSetting[]
  readonly settings?: readonly ManifestDriverSetting[]
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
  readonly values?: readonly { readonly id: string; readonly label: string }[]
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

export type Data = Record<string, never>

export interface ErrorData {
  readonly error_message: string | null
  readonly detail_message: string | null
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

export interface DeviceDetails {
  readonly capabilities: readonly string[]
  readonly data: {
    readonly id: string
    readonly productKey: string
    readonly productName: string
  }
  readonly name: string
}

export type Switch = 0 | 1

export interface BaseAttrs {
  cft_tempL?: number
  cft_tempH?: number
  derog_mode?: 0 | 1 | 2
  derog_time?: number
  lock_switch?: Switch
  mode?: number
  timer_switch?: Switch
}

interface FirstGenDevicePostData {
  readonly raw: [1, 1, number]
}

interface DevicePostData {
  readonly attrs: BaseAttrs
}

export type DevicePostDataAny = DevicePostData | FirstGenDevicePostData

export interface DeviceData {
  readonly attr: Omit<BaseAttrs, 'mode'> & { readonly mode: ModeString }
}

export interface FlowArgs {
  readonly device: HeatzyDevice
  readonly mode: Mode
}
