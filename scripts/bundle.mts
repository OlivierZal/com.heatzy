// Bundles the settings webview into `.homeybuild`, the packaged app the
// Homey CLI assembles: the CLI copies the app first and only then runs
// `npm run build`, so anything emitted into the source tree lands too
// late to ship. Outputs stay a compat pair — index.js (IIFE) for the
// current classic-defer HTML, index.mjs for cached older HTMLs.
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { type BuildOptions, build } from 'esbuild'

// The IIFE global the page's inline `onHomeyReady` reads `start` from.
const GLOBAL_NAME = 'HeatzyWebview'

// The Homey CLI's packaging target: `tsc` already emits here (its
// validated `outDir`), and the CLI packs exactly this directory.
const OUT_ROOT = '.homeybuild'

const HASH_LENGTH = 8

const entryPoints = ['settings/index.mts']

// The packaged page, with the manifest key under which the app serves
// its bundle hash (`GET /webview-hashes`): a booted page compares its
// own `?v=` against the live value and reloads itself once when the
// webview cache served a stale copy.
const pages = [{ entry: 'settings', page: 'settings/index.html' }]

// A local asset reference — an href/src attribute value, with an
// optional existing stamp.
const REFERENCE =
  /(?<prefix>href="|src=")(?<file>[^"':?\/][^"':?]*)(?:\?v=[0-9a-f]+)?(?<suffix>")/gv

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

// Cache-bust the PACKAGED page: phone webviews cache assets across app
// versions, so a content hash per file forces a refetch exactly when a
// file changes. The committed source HTML stays unstamped — `?v=` is a
// package-time transform of the `.homeybuild` copy, which exists in the
// CLI flow (its pre-process copy runs before `npm run build`) and is
// absent in a standalone suite run, which only proves the bundles
// compile.
const hashOf = async (filePath: string): Promise<string> => {
  const content = await readFile(filePath)
  return createHash('sha256')
    .update(content)
    .digest('hex')
    .slice(0, HASH_LENGTH)
}

interface StampedReference {
  readonly hash: string
  readonly index: number
  readonly length: number
  readonly text: string
}

// Every alternative of `REFERENCE` binds all three named groups with at
// least one `file` character, so a match always carries them: the empty
// defaults are the type-level spelling of that invariant, not a runtime
// path. Hashing runs per reference — the page's references are unique,
// and re-hashing a small asset is cheaper than a map whose miss no
// input can reach.
const collectReferences = async (
  html: string,
  directory: string,
): Promise<readonly StampedReference[]> =>
  Promise.all(
    html
      .matchAll(REFERENCE)
      .map(
        async ({
          0: { length },
          groups: { file = '', prefix = '', suffix = '' } = {},
          index,
        }): Promise<StampedReference> => {
          const hash = await hashOf(path.join(directory, file))
          return {
            hash,
            index,
            length,
            text: `${prefix}${file}?v=${hash}${suffix}`,
          }
        },
      ),
  )

// Stamp only within a reference context, so the same filename written
// elsewhere (e.g. a comment) is never rewritten. Rebuilt cursor-wise
// rather than through a `replaceAll` callback, whose loosely typed rest
// arguments cannot carry the named groups safely.
const stampReferences = (
  html: string,
  references: readonly StampedReference[],
): string => {
  let stamped = ''
  let cursor = 0
  for (const { index, length, text } of references) {
    stamped += html.slice(cursor, index) + text
    cursor = index + length
  }
  return stamped + html.slice(cursor)
}

// The page's identity is the join of its UNIQUE stamp values, in
// DOCUMENT order — exactly the page's own collection (its
// `webview-freshness` join dedupes stamps through a Set, so a per-FILE
// dedupe would diverge on two assets with identical bytes): a change to
// any packaged asset (bundle, stylesheet) moves the identity, so
// CSS-only or markup-only ships self-heal too.
const identityOf = (references: readonly StampedReference[]): string | null => {
  const stamps = [...new Set(references.map(({ hash }) => hash))]
  return stamps.length > 0 ? stamps.join('.') : null
}

const stampHtml = async (htmlPath: string): Promise<string | null> => {
  let html: string
  try {
    html = await readFile(htmlPath, 'utf8')
  } catch {
    // The page copy only exists in the CLI flow; a standalone suite run
    // has nothing to stamp.
    return null
  }
  const references = await collectReferences(html, path.dirname(htmlPath))
  const stamped = stampReferences(html, references)
  if (stamped !== html) {
    await writeFile(htmlPath, stamped)
  }
  return identityOf(references)
}

// Emit the live-hash manifest the app serves (`GET /webview-hashes`) —
// only in the CLI flow, where every page copy exists: a standalone
// suite run stamps nothing and must not leave a partial manifest.
const stampedEntries = await Promise.all(
  pages.map(async ({ entry, page }): Promise<[string, string | null]> => [
    entry,
    await stampHtml(path.join(OUT_ROOT, page)),
  ]),
)
if (stampedEntries.every(([, hash]) => hash !== null)) {
  await writeFile(
    path.join(OUT_ROOT, 'webview-hashes.json'),
    JSON.stringify(Object.fromEntries(stampedEntries)),
  )
}
