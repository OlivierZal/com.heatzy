import { describe, expect, expectTypeOf, it } from 'vitest'

import appConfig from '../../.homeycompose/app.json' with { type: 'json' }
import api from '../../api.mts'

const sortedKeys = (object: object): string[] =>
  Object.keys(object).toSorted((left, right) => left.localeCompare(right))

describe('api contract', () => {
  it.each(Object.keys(appConfig.api))(
    '%s handler exists in api.mts',
    (name) => {
      expect(api).toHaveProperty(name)
    },
  )

  // The compile-time half of the contract, asserted on the whole union
  // at once: no per-name method reference ever leaves its object
  // (unbound-method).
  it('should expose only function handlers', () => {
    expectTypeOf<(typeof api)[keyof typeof api]>().toBeFunction()
  })

  it('should not have handlers missing from app.json', () => {
    expect(sortedKeys(api)).toStrictEqual(sortedKeys(appConfig.api))
  })
})
