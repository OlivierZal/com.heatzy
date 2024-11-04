import { createRequire } from 'node:module'

export const changelog = createRequire(import.meta.url)(
  '../.homeychangelog.json',
) as object
