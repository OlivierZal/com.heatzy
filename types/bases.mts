import type { LocalizedStrings } from '@olivierzal/homey-kit/manifest'

export interface CapabilitiesOptionsValues<T extends string> {
  readonly id: T
  readonly title: string | LocalizedStrings
}

export type { LocalizedStrings } from '@olivierzal/homey-kit/manifest'
