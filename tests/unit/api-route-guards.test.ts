import { createRouteGuardSuite } from '@olivierzal/homey-kit/testing'

// The call-site half of the API contract: the settings webview may only
// call routes the app manifest declares. Paths are extracted from the
// sources — literal ones exactly, template-built ones by their fixed
// chunks — and checked against the declared table. The declaration half
// (manifest ids ↔ handlers, both directions, type level) lives in
// api-contract.test.ts. The guard itself is single-sourced in
// @olivierzal/homey-kit/testing; only the table below is this app's.

createRouteGuardSuite([
  {
    manifest: '.homeycompose/app.json',
    name: 'settings',
    sourceDirs: ['settings'],
  },
])
