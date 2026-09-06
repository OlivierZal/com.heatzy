import type {
  ManifestDriver as KitManifestDriver,
  PairSetting,
} from '@olivierzal/homey-kit/manifest'

interface ManifestFlow {
  readonly actions: readonly ManifestFlowCard[]
  readonly conditions: readonly ManifestFlowCard[]
}

interface ManifestFlowCard {
  readonly id: string
}

export interface Manifest {
  readonly drivers: readonly ManifestDriver[]
  readonly flow: ManifestFlow
  readonly version: string
}

// The kit's driver shape (id, name, pair, settings) plus what this app
// reads on top of it.
export interface ManifestDriver extends KitManifestDriver {
  readonly capabilities: readonly string[]
  readonly pair?: readonly PairSetting[]
}
