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

  // Guards the guard: the perimeter read must see the one entry point
  // the bundler declares — the kit only refuses an EMPTY sweep.
  it('reads the entry point the bundler declares', () => {
    expect(entryPoints).toStrictEqual(['settings/index.mts'])
  })

  // The closure is pinned exactly: with no value import today, no
  // app-side assertion can tell a walk that read the file from one that
  // did not (the kit's own suite pins the walk); what this pin does is
  // make the first value import a conscious act — the closure grows and
  // this list must follow, with the floor globs checked in the same
  // move.
  it('reaches no file beyond the entry point today', () => {
    expect(findings.closure).toStrictEqual(entryPoints)
  })

  it('floors every file the settings bundle can emit', () => {
    expect(findings.uncovered).toStrictEqual([])
  })
})
