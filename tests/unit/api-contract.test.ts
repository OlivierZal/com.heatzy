import { createApiContractSuite } from '@olivierzal/homey-kit/testing'

import appConfig from '../../.homeycompose/app.json' with { type: 'json' }
import api from '../../api.mts'

// The declaration half of the API contract: what the surface exposes
// against what its manifest declares. The call-site half (every path a
// webview writes, under a declared method) lives in
// tests/unit/api-route-guards.test.ts. The suite itself is single-sourced
// in @olivierzal/homey-kit/testing; only the table below is this app's.

// The surface's handler union: the type parameter is the compile-time
// half of the contract — the call only typechecks when the whole union
// is callable.
type Handler = (typeof api)[keyof typeof api]

createApiContractSuite<Handler>([{ api, config: appConfig, name: 'app API' }])
