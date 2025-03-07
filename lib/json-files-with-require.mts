import { createRequire } from 'node:module'

// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
export const changelog = createRequire(import.meta.url)(
  '../.homeychangelog.json',
) as Record<string, object>
