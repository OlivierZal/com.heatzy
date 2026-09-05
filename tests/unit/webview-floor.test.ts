import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

import {
  analyzeWebviewFloor,
  getQuotedEntries,
} from '@olivierzal/homey-kit/testing'
import { describe, expect, it } from 'vitest'

// The es2023 webview floor must cover every file the settings bundle
// can emit: the bundler's entry point plus every module it reaches
// through a VALUE import — type imports erase at emit, so they pull
// nothing into a bundle. Today that closure is the entry point alone
// (its only relative imports are type-only), which is exactly when a
// future value import would slip out unnoticed: this suite recomputes
// the closure so such a file must join the floor globs before it can
// ship API the phone engines lack. Inclusion is the invariant — globs
// cover whole directories by design. The perimeter is read from this
// app's own config text; the walk and the glob matching are the kit's.

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url))

const readRepoFile = (relativePath: string): string =>
  readFileSync(path.join(REPO_ROOT, relativePath), 'utf8')

describe.concurrent('webview floor closure', () => {
  const entryPoints = getQuotedEntries(
    readRepoFile('scripts/bundle.mts'),
    'entryPoints',
  )
  const findings = analyzeWebviewFloor({
    entryPoints,
    floorGlobs: getQuotedEntries(
      readRepoFile('eslint.config.ts'),
      'webviewFloorFiles',
    ),
    repoRoot: REPO_ROOT,
  })

  // A walk that dropped its seed would pass the inclusion check
  // vacuously.
  it.each(entryPoints)('walks the closure from %s', (entryPoint) => {
    expect(findings.closure).toContain(entryPoint)
  })

  it('floors every file the settings bundle can emit', () => {
    expect(findings.uncovered).toStrictEqual([])
  })
})
