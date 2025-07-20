export const { changelog } = await (async (): Promise<{
  changelog: Record<string, object>
}> => {
  try {
    return await import('./lib/json-files-with-import.mts')
  } catch {
    return import('./lib/json-files-with-require.mts')
  }
})()
