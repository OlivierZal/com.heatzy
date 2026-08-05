import type { PreviousMode } from '@olivierzal/heatzy-api'

type DeviceSetting = Record<string, unknown>

type OnMode = 'previous' | PreviousMode

export type DeviceSettings = Record<string, DeviceSetting>

export interface Settings extends Partial<Record<string, unknown>> {
  readonly always_on?: boolean
  readonly on_mode?: OnMode
}

export interface Store {
  readonly derogationEnd: number | null
  readonly previousMode: PreviousMode | null
}
