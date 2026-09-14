import { fileURLToPath } from 'node:url'
import path from 'node:path'

import { build } from 'esbuild'
import { describe, expect, it } from 'vitest'

import {
  entryPoints,
  webviewFloorFiles,
} from '../../scripts/webview-perimeter.mts'

// The es2023 webview floor must cover every file the settings bundle
// emits: a reached file outside the floor globs would ship API the
// phone engines lack without any lint saying so. The bundler is the
// authority on what it emits, so its metafile — the real entry point,
// bundled in memory — is the measurement; a text walk of the import
// graph could only approximate it. Modules the bundle pulls in from
// `node_modules` are out of scope: the kit floors its own webview
// modules through its own lint.

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url))

const isFloored = (input: string): boolean =>
  webviewFloorFiles.some((glob) => path.matchesGlob(input, glob))

describe('webview floor closure', () => {
  it('floors every file the settings bundle emits', async () => {
    const { metafile } = await build({
      absWorkingDir: REPO_ROOT,
      bundle: true,
      entryPoints: [...entryPoints],
      format: 'esm',
      logLevel: 'silent',
      metafile: true,
      write: false,
    })
    const inputs = Object.keys(metafile.inputs).filter(
      (input) => !input.startsWith('node_modules/'),
    )

    // Today the bundle emits the entry point alone — its only relative
    // imports are type-only — which is exactly when a future value
    // import would slip out unnoticed: this pin makes the first one a
    // conscious act, the floor globs checked in the same move. Compared
    // as sets: the metafile's key order is the bundler's, not a fact.
    expect(new Set(inputs)).toStrictEqual(new Set(entryPoints))
    expect(inputs.filter((input) => !isFloored(input))).toStrictEqual([])
  })
})
