export const { changelog } = await (async (): Promise<{
  changelog: Record<string, object>
}> => {
  try {
    return await import('./lib/json-files-with-import.mjs')
  } catch {
    return import('./lib/json-files-with-require.mjs')
  }
})()
