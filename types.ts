import type { DerogMode, LoginCredentials, Mode } from './heatzy/types'
import type HeatzyDevice from './drivers/heatzy/device'

export type ModeCapability = 'mode' | 'mode3'

export enum PreviousModeValue {
  cft = 'cft',
  cft1 = 'cft1',
  cft2 = 'cft2',
  eco = 'eco',
  fro = 'fro',
}

export enum OnModeSetting {
  cft = 'cft',
  eco = 'eco',
  previous = 'previous',
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

export interface HomeySettingsUI {
  readonly expireAt?: number
  readonly password?: string
  readonly token?: string
  readonly username?: string
}

export interface ManifestDriverSettingData {
  readonly max?: number
  readonly min?: number
  readonly units?: string
  readonly values?: readonly {
    readonly id: string
    readonly label: Record<string, string>
  }[]
  readonly id: string
  readonly label: Record<string, string>
  readonly type: string
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
  readonly pair?: LoginSetting & readonly PairSetting[]
  readonly settings?: readonly ManifestDriverSetting[]
  readonly id: string
}

export interface DriverSetting {
  placeholder?: string
  readonly groupId?: string
  readonly groupLabel?: string
  readonly max?: number
  readonly min?: number
  readonly units?: string
  readonly values?: readonly { readonly id: string; readonly label: string }[]
  title: string
  readonly driverId: string
  readonly id: string
  readonly type: string
}

export interface LoginDriverSetting extends DriverSetting {
  readonly id: keyof LoginCredentials
}

export type DeviceSetting = Record<string, ValueOf<Settings>[]>

export type DeviceSettings = Record<string, DeviceSetting>

export interface DeviceDetails {
  readonly capabilities: readonly string[]
  readonly data: {
    readonly id: string
    readonly productKey: string
    readonly productName: string
  }
  readonly name: string
}

export interface FlowArgs {
  readonly derog_time: string
  readonly device: HeatzyDevice
  readonly mode: keyof typeof Mode
  readonly onoff: boolean
  readonly target_temperature: number
}
