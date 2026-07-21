import type { DerogationMode, Mode } from '@olivierzal/heatzy-api'

import type { CapabilitiesOptionsValues } from './bases.mts'

export interface Capabilities extends SetCapabilities {
  readonly alarm_presence: boolean
  readonly derog_end: string | null
  readonly measure_humidity: number
  readonly measure_temperature: number
  readonly operational_state: Mode
}

export interface CapabilitiesOptions {
  readonly heater_operation_mode: {
    readonly values: readonly CapabilitiesOptionsValues<
      keyof typeof DerogationMode
    >[]
  }
  readonly operational_state: {
    readonly values: readonly CapabilitiesOptionsValues<Mode>[]
  }
  readonly thermostat_mode: {
    readonly values: readonly CapabilitiesOptionsValues<Mode>[]
  }
}

export interface SetCapabilities {
  readonly derog_time: string
  readonly heater_operation_mode: keyof typeof DerogationMode
  readonly locked: boolean
  readonly onoff: boolean
  readonly 'onoff.timer': boolean
  readonly 'onoff.window_detection': boolean
  readonly target_temperature: number
  readonly 'target_temperature.eco': number
  readonly thermostat_mode: Mode
}
