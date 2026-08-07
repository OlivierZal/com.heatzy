import { swcPlugin } from '@olivierzal/configs/vitest-swc'
import { type ViteUserConfig, defineConfig } from 'vitest/config'

const config: ViteUserConfig = defineConfig({
  oxc: false,
  plugins: [swcPlugin],
  test: {
    coverage: {
      exclude: ['.homeybuild/**', 'scripts/**/*.mts', 'settings/**/*.mts'],
      include: ['**/*.mts'],
      reporter: ['text', 'lcov'],
      thresholds: {
        branches: 100,
        functions: 100,
        lines: 100,
        statements: 100,
      },
    },
    include: ['tests/**/*.test.ts'],
  },
})

export default config
