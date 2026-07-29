import { describe, expect, expectTypeOf, it } from 'vitest'

import appConfig from '../../.homeycompose/app.json' with { type: 'json' }
import api from '../../api.mts'

const sortedKeys = (object: object): string[] =>
  Object.keys(object).toSorted((left, right) => left.localeCompare(right))

// One equality pins the ids <-> handlers mapping in both directions at
// once: a handler with no declaration and a declaration with no handler
// both break it, and the diff names the offender. A per-id existence
// sweep alongside it could only ever fail together with the equality,
// so it is not kept.
describe('api contract', () => {
  // The compile-time half of the contract, asserted on the whole union
  // at once: no per-name method reference ever leaves its object
  // (unbound-method).
  it('should expose only function handlers', () => {
    expectTypeOf<(typeof api)[keyof typeof api]>().toBeFunction()
  })

  it('should declare exactly the handlers app.json names', () => {
    expect(sortedKeys(api)).toStrictEqual(sortedKeys(appConfig.api))
  })
})
