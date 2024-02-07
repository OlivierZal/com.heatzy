import type HeatzyDevice from './drivers/heatzy/device'
import type Homey from 'homey/lib/Homey'
import type { SimpleClass } from 'homey'

export type ModeCapability = 'mode' | 'mode3'

export const NUMBER_1 = 1

export enum Mode {
  cft = 0,
  eco = 1,
  fro = 2,
  stop = 3,
  cft1 = 4,
  cft2 = 5,
}

export enum PreviousModeValue {
  cft = 'cft',
  eco = 'eco',
  fro = 'fro',
  cft1 = 'cft1',
  cft2 = 'cft2',
}

export enum OnModeSetting {
  cft = 'cft',
  eco = 'eco',
  previous = 'previous',
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type HomeyClass = new (...args: any[]) => SimpleClass & {
  readonly homey: Homey
  readonly setWarning?: (warning: string | null) => Promise<void>
}

export interface Capabilities {
  readonly derog_end: string | null
  readonly derog_mode: keyof typeof DerogMode
  readonly derog_time_boost: string
  readonly derog_time_vacation: string
  readonly locked: boolean
  readonly mode: keyof typeof Mode
  readonly mode3: keyof typeof Mode
  readonly onoff: boolean
  readonly 'onoff.timer': boolean
  readonly target_temperature: number
  readonly 'target_temperature.complement': number
}

export type ValueOf<T> = T[keyof T]

export interface Settings {
  readonly always_on?: boolean
  readonly on_mode?: OnModeSetting
}

export interface Store {
  readonly previousMode: PreviousModeValue | null
}

interface BaseHomeySettings<T1, T2> {
  readonly username: T1
  readonly password: T1
  readonly token: T1
  readonly expireAt: T2
}

export type HomeySettings = BaseHomeySettings<string | null, number | null>

export type HomeySettingsUI = BaseHomeySettings<
  string | undefined,
  number | undefined
>

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

export type DeviceSetting = Record<string, ValueOf<Settings>[]>

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

interface FirstGenDevicePostData {
  readonly raw: [typeof NUMBER_1, typeof NUMBER_1, Mode]
}

export interface BaseAttrs {
  cft_tempL?: number
  cft_tempH?: number
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

export interface FlowArgs {
  readonly device: HeatzyDevice
  readonly derog_time: string
  readonly mode: keyof typeof Mode
  readonly onoff: boolean
  readonly target_temperature: number
}
