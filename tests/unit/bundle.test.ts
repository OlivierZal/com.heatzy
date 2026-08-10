import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The bundler is a top-level-await script working against the current
// directory (the Homey CLI runs it from the packaged app's root), so
// each test materializes a miniature app in a temp directory, moves
// there, and imports the script afresh.
const HASH_LENGTH = 8

const initialDirectory = process.cwd()

const ENTRY_SOURCE = `export const start = (value?: string): string =>
  value ?? 'booted'
`

// Prettier owns the page's shape, so the fixture carries the two forms
// it emits: attributes inline, and — once a tag outgrows the print
// width — one per line. A reference pattern scoped to a tag or to a
// single line would still stamp the inline form and silently miss the
// exploded one.
const PAGE_HTML = `<!doctype html>
<html lang="en">
  <head>
    <!-- index.js is mentioned here and must stay unstamped -->
    <link href="index.css" rel="stylesheet" />
    <script defer src="index.js"></script>
    <script
      data-testid="a-tag-past-the-print-width-that-prettier-explodes"
      defer
      src="index.mjs?v=deadbeef"
    ></script>
    <script data-origin="settings" defer src="/homey.js"></script>
  </head>
  <body></body>
</html>
`

const hashOf = (content: string | Buffer): string =>
  createHash('sha256').update(content).digest('hex').slice(0, HASH_LENGTH)

// Cwd-relative on purpose: every test runs from inside its own temp
// app, exactly where the Homey CLI runs the script from.
const seedApp = async (): Promise<void> => {
  await mkdir('settings', { recursive: true })
  await writeFile('settings/index.mts', ENTRY_SOURCE)
}

const seedPackagedPage = async (html: string): Promise<void> => {
  await mkdir('.homeybuild/settings', { recursive: true })
  await writeFile('.homeybuild/settings/index.html', html)
  await writeFile('.homeybuild/settings/index.css', 'body { color: red; }\n')
}

const runBundler = async (): Promise<void> => {
  vi.resetModules()
  await import('../../scripts/bundle.mts')
}

const packagedFile = async (relativePath: string): Promise<string> =>
  readFile(path.join('.homeybuild', relativePath), 'utf8')

describe('bundle script', () => {
  let workDirectory = ''

  beforeEach(async () => {
    workDirectory = await mkdtemp(path.join(tmpdir(), 'bundle-'))
    process.chdir(workDirectory)
    await seedApp()
  })

  afterEach(async () => {
    process.chdir(initialDirectory)
    await rm(workDirectory, { force: true, recursive: true })
  })

  it('should emit the compat pair into the packaged app', async () => {
    await runBundler()

    const iife = await packagedFile('settings/index.js')
    const twin = await packagedFile('settings/index.mjs')

    expect(iife).toContain('var HeatzyWebview')
    expect(iife).not.toContain('export')
    // The twin is a SECOND IIFE, not ESM: the cached-HTML era loaded it
    // as a classic `defer` script, so its footer self-wires the global
    // the SDK calls and an `export` would choke the page.
    expect(twin).toContain('var HeatzyWebview')
    expect(twin).not.toContain('export')
    expect(twin).toContain('globalThis.onHomeyReady')
    expect(twin).toContain('HeatzyWebview.start(homey)')
    // es2020 target: nullish coalescing ships as-is, unlowered
    expect(iife).toContain('??')
  })

  it('should stamp references only, and emit the manifest', async () => {
    await seedPackagedPage(PAGE_HTML)

    await runBundler()

    const stamped = await packagedFile('settings/index.html')
    const jsHash = hashOf(await packagedFile('settings/index.js'))
    const cssHash = hashOf(await packagedFile('settings/index.css'))
    const mjsHash = hashOf(await packagedFile('settings/index.mjs'))

    expect(stamped).toContain(`href="index.css?v=${cssHash}"`)
    expect(stamped).toContain(`src="index.js?v=${jsHash}"`)
    // The stale stamp is replaced, never doubled
    expect(stamped).toContain(`src="index.mjs?v=${mjsHash}"`)
    expect(stamped).not.toContain('deadbeef')
    // Outside a reference context nothing moves
    expect(stamped).toContain(
      '<!-- index.js is mentioned here and must stay unstamped -->',
    )
    expect(stamped).toContain('src="/homey.js"')

    const manifest: unknown = JSON.parse(
      await packagedFile('webview-hashes.json'),
    )

    // Document order: stylesheet first, then the two bundles
    expect(manifest).toStrictEqual({
      settings: [cssHash, jsHash, mjsHash].join('.'),
    })
  })

  it('should rewrite nothing when the stamps are already fresh', async () => {
    await seedPackagedPage(PAGE_HTML)

    await runBundler()

    const once = await packagedFile('settings/index.html')

    await runBundler()

    await expect(packagedFile('settings/index.html')).resolves.toBe(once)
  })

  it('should move the stamps when an asset changes', async () => {
    await seedPackagedPage(PAGE_HTML)

    await runBundler()

    const before = await packagedFile('settings/index.html')
    await writeFile('.homeybuild/settings/index.css', 'body { color: blue; }\n')

    await runBundler()

    await expect(packagedFile('settings/index.html')).resolves.not.toBe(before)
  })

  it('should join identical stamps once, as the page itself does', async () => {
    await seedPackagedPage(
      '<html><head><link href="a.css" rel="stylesheet"><link href="b.css" rel="stylesheet"></head></html>',
    )
    const twinBytes = 'body { margin: 0; }\n'
    await writeFile('.homeybuild/settings/a.css', twinBytes)
    await writeFile('.homeybuild/settings/b.css', twinBytes)

    await runBundler()

    const manifest: unknown = JSON.parse(
      await packagedFile('webview-hashes.json'),
    )

    // The page joins UNIQUE stamp values — the manifest must agree, or
    // twin-byte assets would loop the freshness handshake
    expect(manifest).toStrictEqual({ settings: hashOf(twinBytes) })
  })

  it('should stamp nothing in a standalone suite run', async () => {
    await runBundler()

    await expect(packagedFile('webview-hashes.json')).rejects.toThrow('ENOENT')
  })

  it('should skip the manifest when a page carries no local reference', async () => {
    await seedPackagedPage(
      '<html><head><script src="/homey.js"></script></head></html>',
    )

    await runBundler()

    await expect(packagedFile('webview-hashes.json')).rejects.toThrow('ENOENT')
  })
})
