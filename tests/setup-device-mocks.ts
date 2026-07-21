import type HomeyModule from 'homey'
import { vi } from 'vitest'

import type { InteropModule } from './helpers.ts'

// Baseline `homey` module double for the device project: the SDK only
// exists on the Homey runtime, never in node_modules, so every device
// test runs against a mock. Tests that need wired doubles re-register
// their own factory in-file, which overrides this one.
vi.mock(import('homey'), async () => {
  const { createMockDeviceClass, mock } = await import('./helpers.ts')
  return mock<InteropModule<typeof HomeyModule>>({
    default: {
      Device: createMockDeviceClass(),
      Driver: vi.fn<() => void>(),
    },
  })
})
