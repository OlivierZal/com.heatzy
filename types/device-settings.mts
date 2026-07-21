import type { PreviousMode } from '@olivierzal/heatzy-api'

export type DeviceSetting = Record<string, unknown>

export type DeviceSettings = Record<string, DeviceSetting>

export type OnMode = 'previous' | PreviousMode

export interface Settings extends Partial<Record<string, unknown>> {
  readonly always_on?: boolean
  readonly on_mode?: OnMode
}

export interface Store {
  readonly previousMode: PreviousMode | null
}
