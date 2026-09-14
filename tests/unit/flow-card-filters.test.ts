import { readFile } from 'node:fs/promises'

import { describe, expect, it } from 'vitest'

// The eco-temperature action filtered on `driver_id=melcloud_atw` — an
// id from the sibling app — until 2026-08-05 (#1074): the card listed
// no device and nothing noticed, because nothing relates a card's
// device filter to the drivers and capabilities this app declares.
// Every filter is pinned here to the manifest it targets.
describe('flow card device filters', () => {
  it('should name a driver of this app and a capability it declares', async () => {
    const manifest = JSON.parse(await readFile('app.json', 'utf8')) as {
      drivers: { capabilities: string[]; id: string }[]
      flow?: Record<
        string,
        { id: string; args?: { type: string; filter?: string }[] }[]
      >
    }
    const capabilitiesOf = new Map(
      manifest.drivers.map(({ capabilities, id }) => [id, capabilities]),
    )
    const mismatches = Object.entries(manifest.flow ?? {}).flatMap(
      ([kind, cards]) =>
        cards.flatMap((card) =>
          (card.args ?? [])
            .filter(({ type }) => type === 'device')
            .flatMap(({ filter }) => {
              const parameters = new URLSearchParams(filter)
              const capability = parameters.get('capabilities')
              const driverIds = parameters.get('driver_id')?.split('|') ?? []
              return driverIds.flatMap((driverId) => {
                const declared = capabilitiesOf.get(driverId)
                if (declared === undefined) {
                  return [`${kind}/${card.id}: unknown driver ${driverId}`]
                }
                return capability !== null && !declared.includes(capability)
                  ? [
                      `${kind}/${card.id}: ${driverId} declares no ${capability}`,
                    ]
                  : []
              })
            }),
        ),
    )

    expect(mismatches).toStrictEqual([])
  })
})
