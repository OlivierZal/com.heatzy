// `app.mts` loads this module at boot, so the device parses it before
// running anything: import attributes (`with { type: 'json' }`) are a
// parse-time SyntaxError on the pre-Node-20 engine of the oldest
// firmware the manifest supports, and no try/catch can recover a module
// that never parsed. `createRequire` reads the same file with syntax
// every engine accepts, while the type-only import keeps tsc's
// inference and erases at emit. `tests/unit/node-floor.test.ts` holds
// the invariant for every shipped module, not just this one.
import { createRequire } from 'node:module'

import type ChangelogJson from './.homeychangelog.json'

// Binds every readable path to the shape tsc inferred for it, so a
// mistyped path is a compile error rather than a runtime one.
interface JsonFiles {
  './.homeychangelog.json': typeof ChangelogJson
}

const requireJson = createRequire(import.meta.url)

const loadJson = <TPath extends keyof JsonFiles>(
  path: TPath,
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- the module system types every read as `any`; the mapping above restores the shape tsc inferred
): JsonFiles[TPath] => requireJson(path) as JsonFiles[TPath]

export const changelog: typeof ChangelogJson = loadJson(
  './.homeychangelog.json',
)
