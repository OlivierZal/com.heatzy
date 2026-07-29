import { describe, expect, expectTypeOf, it } from 'vitest'

import appConfig from '../../.homeycompose/app.json' with { type: 'json' }
import api from '../../api.mts'

// The declaration half of the API contract: what the surface exposes
// against what its manifest declares. The call-site half (every path a
// webview writes, under a declared method) lives in
// tests/unit/api-route-guards.test.ts.
const SURFACES = [{ api, config: appConfig, name: 'app API' }]

// The surface's handler union, so the compile-time half is asserted
// once — this app exposes a single surface.
type Handler = (typeof api)[keyof typeof api]

// Everything below the SURFACES table is the shared contract test,
// byte-identical in com.melcloud, com.heatzy and com.melcloud.extension
// — edit all three together. Only the table and the Handler union above
// differ: they name what each app exposes.

const sortedKeys = (object: object): string[] =>
  Object.keys(object).toSorted((left, right) => left.localeCompare(right))

describe('api contract', () => {
  // Asserted on the whole union at once: no per-name method reference
  // ever leaves its object (unbound-method).
  it('should expose only function handlers', () => {
    expectTypeOf<Handler>().toBeFunction()
  })

  // One equality per surface pins the ids ↔ handlers mapping in both
  // directions at once: a handler with no declaration and a declaration
  // with no handler both break it, and the diff names the offender. A
  // per-id existence sweep alongside it could only ever fail together
  // with the equality, so it is not kept.
  it.each(SURFACES)(
    '$name should declare exactly the handlers its manifest names',
    ({ api: surfaceApi, config }) => {
      expect(sortedKeys(surfaceApi)).toStrictEqual(sortedKeys(config.api))
    },
  )
})
