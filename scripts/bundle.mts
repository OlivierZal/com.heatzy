// Bundles the settings webview into `.homeybuild`, the packaged app the
// Homey CLI assembles: the CLI copies the app first and only then runs
// `npm run build`, so anything emitted into the source tree lands too
// late to ship. Outputs stay a compat pair — index.js (IIFE) for the
// current classic-defer HTML, index.mjs for cached older HTMLs.
import path from 'node:path'

import { stampPackagedPages } from '@olivierzal/homey-kit/node'
import { type BuildOptions, build } from 'esbuild'

// The IIFE global the page's inline `onHomeyReady` reads `start` from.
const GLOBAL_NAME = 'HeatzyWebview'

// The Homey CLI's packaging target: `tsc` already emits here (its
// validated `outDir`), and the CLI packs exactly this directory.
const OUT_ROOT = '.homeybuild'

const entryPoints = ['settings/index.mts']

// The packaged page, with the manifest key under which the app serves
// its bundle hash (`GET /webview-hashes`): a booted page compares its
// own `?v=` against the live value and reloads itself once when the
// webview cache served a stale copy.
const pages = [{ entry: 'settings', page: 'settings/index.html' }]

const sharedOptions: BuildOptions = {
  // Pinned at load: esbuild's service process outlives this module and
  // keeps its own working directory, so relative entries must be
  // anchored to the app root explicitly.
  absWorkingDir: process.cwd(),
  bundle: true,
  legalComments: 'none',
  logLevel: 'info',
  minify: true,
  target: ['es2020'],
}

await Promise.all(
  entryPoints.flatMap((entryPoint) => {
    const outBase = path.join(OUT_ROOT, entryPoint.replace(/\.mts$/v, ''))
    return [
      build({
        ...sharedOptions,
        entryPoints: [entryPoint],
        format: 'iife',
        globalName: GLOBAL_NAME,
        outfile: `${outBase}.js`,
      }),
      // Compat divergence from com.melcloud: this app's cached-HTML era
      // loaded `index.mjs` as a CLASSIC `defer` script (never
      // `type="module"`), and those pages declare no inline
      // `onHomeyReady`. The twin is therefore a SECOND IIFE whose
      // footer self-wires the global the SDK calls — plain ESM would
      // choke a classic script on `export`.
      build({
        ...sharedOptions,
        entryPoints: [entryPoint],
        footer: {
          js: `;globalThis.onHomeyReady = (homey) => { globalThis.${GLOBAL_NAME}.start(homey) };`,
        },
        format: 'iife',
        globalName: GLOBAL_NAME,
        outfile: `${outBase}.mjs`,
      }),
    ]
  }),
)

// Cache-bust the PACKAGED page once the bundles it references exist:
// phone webviews cache assets across app versions, so every local
// reference of the `.homeybuild` page copy is stamped with a content
// hash and the manifest `GET /webview-hashes` serves is emitted beside
// it. The committed source HTML stays unstamped — the copy exists in
// the CLI flow (its pre-process copy runs before `npm run build`) and
// is absent in a standalone suite run, which only proves the bundles
// compile; a partial tree or an unreadable copy fails the pass.
await stampPackagedPages(OUT_ROOT, pages)
