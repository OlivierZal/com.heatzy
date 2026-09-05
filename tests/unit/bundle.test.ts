import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The bundler is a top-level-await script working against the current
// directory (the Homey CLI runs it from the packaged app's root), so
// each test materializes a miniature app in a temp directory, moves
// there, and imports the script afresh.
const initialDirectory = process.cwd()

const ENTRY_SOURCE = `export const start = (value?: string): string =>
  value ?? 'booted'
`

// A packaged page referencing the compat pair the script emits plus a
// stylesheet it does not: the stamp pass must find every one of them.
const PAGE_HTML = `<!doctype html>
<html lang="en">
  <head>
    <link href="index.css" rel="stylesheet" />
    <script defer src="index.js"></script>
    <script defer src="index.mjs"></script>
  </head>
  <body></body>
</html>
`

// The stamps a packaged page carries, in document order.
const STAMP = /\?v=(?<stamp>[0-9a-f]+)"/gv

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

  it('should stamp the packaged page after the bundles it references exist', async () => {
    await seedPackagedPage(PAGE_HTML)

    await runBundler()

    const stamped = await packagedFile('settings/index.html')

    // Both halves of the compat pair are hashed, so the stamp pass runs
    // only once esbuild has emitted them.
    expect(stamped).toMatch(/src="index\.js\?v=[0-9a-f]+"/v)
    expect(stamped).toMatch(/src="index\.mjs\?v=[0-9a-f]+"/v)

    const stamps = stamped
      .matchAll(STAMP)
      .map((match) => match.groups?.stamp)
      .filter((stamp) => stamp !== undefined)
      .toArray()
    const manifest: unknown = JSON.parse(
      await packagedFile('webview-hashes.json'),
    )

    // Served under the page's entry, the identity the stamped page
    // computes for itself — what the booted page compares against.
    expect(stamps).toHaveLength(3)
    expect(manifest).toStrictEqual({ settings: stamps.join('.') })
  })

  it('should stamp nothing in a standalone suite run', async () => {
    await runBundler()

    await expect(packagedFile('webview-hashes.json')).rejects.toThrow('ENOENT')
  })
})
