export const { changelog } = await (async (): Promise<{
  changelog: object
}> => {
  try {
    return await import('./lib/jsonFilesWithImport.mjs')
  } catch {
    return import('./lib/jsonFilesWithRequire.mjs')
  }
})()
