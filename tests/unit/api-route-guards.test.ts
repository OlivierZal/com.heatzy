import { readdir, readFile } from 'node:fs/promises'

import { describe, expect, it } from 'vitest'

interface DeclaredRoute {
  readonly method: string
  readonly path: string
}

// The call-site half of the API contract: the settings webview may only
// call routes the app manifest declares. Literal paths are extracted
// from the sources and checked against the declared table;
// template-built paths are out of scope by design. The declaration half
// (manifest ids ↔ handlers, both directions, type level) lives in
// api-contract.test.ts.
const SOURCE_DIRS: readonly string[] = ['settings']

const readRoutes = async (): Promise<DeclaredRoute[]> => {
  const manifest = JSON.parse(
    await readFile('.homeycompose/app.json', 'utf8'),
  ) as { api?: Record<string, DeclaredRoute> }
  return Object.values(manifest.api ?? {})
}

const listSourceFiles = async (dir: string): Promise<string[]> => {
  const entries = await readdir(dir)
  return entries
    .filter((entry) => entry.endsWith('.mts') || entry.endsWith('.html'))
    .map((entry) => `${dir}/${entry}`)
}

// Comment lines are dropped so a path mentioned in prose is not read as
// a call site.
const stripComments = (source: string): string =>
  source
    .split('\n')
    .filter((line) => {
      const trimmed = line.trimStart()
      return (
        !trimmed.startsWith('//') &&
        !trimmed.startsWith('*') &&
        !trimmed.startsWith('/*')
      )
    })
    .join('\n')

const extractPathLiterals = (source: string): string[] =>
  stripComments(source)
    .matchAll(/['"](?<path>\/[a-z][\w\-\/]*)['"]/gv)
    .map((match) => match.groups?.path ?? '')
    .toArray()

const routeMatches = (routePath: string, literal: string): boolean => {
  const routeSegments = routePath.split('/')
  const literalSegments = literal.split('/')
  return (
    routeSegments.length === literalSegments.length &&
    routeSegments.every(
      (segment, index) =>
        segment.startsWith(':') || segment === literalSegments[index],
    )
  )
}

describe('api route guards', () => {
  it('should declare every path the settings webview calls', async () => {
    const routes = await readRoutes()
    const fileGroups = await Promise.all(
      SOURCE_DIRS.map(async (dir) => listSourceFiles(dir)),
    )
    const sources = await Promise.all(
      fileGroups.flat().map(async (file) => readFile(file, 'utf8')),
    )
    const literals = sources.flatMap((source) => extractPathLiterals(source))
    const unmatched = [...new Set(literals)].filter((literal) =>
      routes.every((route) => !routeMatches(route.path, literal)),
    )

    expect(unmatched).toStrictEqual([])
  })
})
