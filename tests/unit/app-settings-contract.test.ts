import type { HeatzyAPISettings } from '@olivierzal/heatzy-api'
import { describe, expectTypeOf, it } from 'vitest'

import type { HomeySettings } from '../../types/app-settings.mts'

// The app hand-maintains HomeySettings while heatzy-api owns the key
// names its SettingManager writes, so the union drifts silently — that
// is how com.melcloud ended up persisting loginBackoffUntil for
// releases without declaring it. This fails at typecheck the day a
// release adds a @setting accessor.
//
// One-way on purpose: HomeySettings legitimately carries the app's own
// notifiedVersion, which the library knows nothing about. And no
// prefixing to model here, unlike com.melcloud — this app drives a
// single dialect, so #createSettingManager passes keys through
// untouched.
describe('app settings contract', () => {
  it('should declare every key the library can write', () => {
    expectTypeOf<keyof HeatzyAPISettings>().toExtend<keyof HomeySettings>()
  })
})
