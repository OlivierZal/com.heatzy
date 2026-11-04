import { getDriverSettings } from '@olivierzal/homey-kit/manifest'
import { describe, expect, it } from 'vitest'

import manifest from '../../app.json' with { type: 'json' }

// The settings page reads its controls through the kit's `parseFormValue`,
// which reads a finite numeric string as a NUMBER. Every control the
// page builds is a select over the manifest's dropdown ids (or the
// boolean pair), and a dropdown id is a string on the wire: an id that
// parses as a number would be pushed as a number the driver never
// declared, and read as divergent from its own stored value forever.
// The kit's bounded-number strategy is not the hook for it — it fires
// only for `type="number"` inputs, which this page never builds — so
// the ids themselves carry the constraint. The controls are read through
// the page's own reader, `getDriverSettings`, so the ids judged here are
// exactly the ones the page offers.
describe('device settings contract', () => {
  it('should declare no dropdown id that reads as a number', () => {
    const numericIds = manifest.drivers
      .flatMap((driver) => getDriverSettings(driver, 'en'))
      .filter(({ type }) => type === 'dropdown')
      .flatMap(({ values }) => values ?? [])
      .map(({ id }) => id)
      .filter((id) => Number.isFinite(Number(id)))

    expect(numericIds).toStrictEqual([])
  })
})
