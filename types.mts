import type { LoginPostData, Mode } from '@olivierzal/heatzy-api'

import type HeatzyDevice from './drivers/heatzy/device.mts'

interface CapabilitiesOptionsValues<T extends string> {
  readonly id: T
  readonly title: LocalizedStrings
}

interface LocalizedStrings extends Partial<Record<string, string>> {
  readonly en: string
}

export interface Capabilities extends SetCapabilities {
  readonly alarm_heat: boolean
  readonly derog_end: string | null
  readonly measure_humidity: number
  readonly measure_temperature: number
  readonly operational_state: keyof typeof Mode
  readonly 'operational_state.signal': keyof typeof Mode
}

export interface CapabilitiesOptions {
  readonly thermostat_mode: {
    readonly values: readonly CapabilitiesOptionsValues<keyof typeof Mode>[]
  }
}

export interface DeviceDetails {
  readonly capabilitiesOptions: CapabilitiesOptions
  readonly data: { readonly id: string }
  readonly name: string
}

export interface DriverCapabilitiesOptions {
  readonly title: string
  readonly type: string
  readonly values?: readonly { readonly id: string; readonly label: string }[]
}

export interface DriverSetting {
  readonly driverId: string
  readonly id: string
  title: string
  readonly type: string
  readonly groupId?: string
  readonly groupLabel?: string
  readonly max?: number
  readonly min?: number
  placeholder?: string
  readonly units?: string
  readonly values?: readonly { readonly id: string; readonly label: string }[]
}

export interface FlowArgs {
  readonly derog_time: string
  readonly device: HeatzyDevice
  readonly mode: keyof typeof Mode
  readonly onoff: boolean
  readonly target_temperature: number
}

export interface HomeySettings {
  readonly expireAt?: string | null
  readonly notifiedVersion?: string | null
  readonly password?: string | null
  readonly token?: string | null
  readonly username?: string | null
}

export interface LoginDriverSetting extends DriverSetting {
  readonly id: keyof LoginPostData
}

export interface LoginSetting extends PairSetting {
  readonly id: 'login'
  readonly options: {
    readonly passwordLabel: LocalizedStrings
    readonly passwordPlaceholder: LocalizedStrings
    readonly usernameLabel: LocalizedStrings
    readonly usernamePlaceholder: LocalizedStrings
  }
}

export interface Manifest {
  readonly drivers: readonly ManifestDriver[]
  readonly version: string
}

export interface ManifestDriver {
  readonly id: string
  readonly capabilities?: readonly string[]
  readonly capabilitiesOptions?: Record<
    string,
    ManifestDriverCapabilitiesOptions
  >
  readonly pair?: LoginSetting & readonly PairSetting[]
  readonly settings?: readonly ManifestDriverSetting[]
}

export interface ManifestDriverCapabilitiesOptions {
  readonly title: LocalizedStrings
  readonly type: string
  readonly values?: readonly CapabilitiesOptionsValues<string>[]
}

export interface ManifestDriverSetting {
  readonly label: LocalizedStrings
  readonly children?: readonly ManifestDriverSettingData[]
  readonly id?: string
}

export interface ManifestDriverSettingData {
  readonly id: string
  readonly label: LocalizedStrings
  readonly type: string
  readonly max?: number
  readonly min?: number
  readonly units?: string
  readonly values?: readonly {
    readonly id: string
    readonly label: LocalizedStrings
  }[]
}

export interface PairSetting {
  readonly id: string
}

export interface SetCapabilities {
  readonly derog_time_boost: string
  readonly derog_time_vacation: string
  readonly locked: boolean
  readonly onoff: boolean
  readonly 'onoff.timer': boolean
  readonly 'onoff.window_detection': boolean
  readonly target_temperature: number
  readonly 'target_temperature.eco': number
  readonly thermostat_mode: keyof typeof Mode
}

export interface Settings extends Partial<Record<string, unknown>> {
  readonly always_on?: boolean
  readonly on_mode?: OnMode
}

export interface Store {
  readonly previousMode?: PreviousMode
}

export type DeviceSetting = Record<string, ValueOf<Settings>>

export type DeviceSettings = Record<string, DeviceSetting>

export type OnMode = 'previous' | PreviousMode

export type PreviousMode = Exclude<Mode, Mode.stop>

export type ValueOf<T> = T[keyof T]

const baseValues = [
  { id: 'cft', title: { en: 'Comfort', fr: 'Confort' } },
  { id: 'eco', title: { en: 'Eco', fr: 'Éco' } },
  { id: 'fro', title: { en: 'Anti-frost', fr: 'Anti-gel' } },
  { id: 'stop', title: { en: 'Off', fr: 'Désactivé' } },
] as const
const extendedValues = [
  { id: 'cft2', title: { en: 'Comfort 2', fr: 'Confort 2' } },
  { id: 'cft1', title: { en: 'Comfort 1', fr: 'Confort 1' } },
] as const
export const getCapabilitiesOptions = (
  doesNotSupportExtendedMode: boolean,
): CapabilitiesOptions => ({
  thermostat_mode: {
    values: [
      ...(doesNotSupportExtendedMode ? [] : extendedValues),
      ...baseValues,
    ],
  },
})
