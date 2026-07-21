import type PairSession from 'homey/lib/PairSession'
import {
  type LoginCredentials,
  AuthenticationError,
  Mode,
  Product,
} from '@olivierzal/heatzy-api'

import type { AuthenticationAPI } from '../../types/api.mts'
import type { CapabilitiesOptionsValues } from '../../types/bases.mts'
import type {
  CapabilitiesOptions,
  SetCapabilities,
} from '../../types/capabilities.mts'
import type { ManifestDriver } from '../../types/manifest.mts'
import { type Homey, Driver } from '../../lib/homey.mts'
import type HeatzyDevice from './device.mts'

const NOT_FOUND = -1

// Capabilities Homey can write back to the wire — the action-card and
// capability-listener surface (conditions cover every capability).
export const SETTABLE_CAPABILITIES: readonly (keyof SetCapabilities)[] = [
  'derog_time',
  'heater_operation_mode',
  'locked',
  'onoff',
  'onoff.timer',
  'onoff.window_detection',
  'target_temperature',
  'target_temperature.eco',
  'thermostat_mode',
]

const settableCapabilities: ReadonlySet<string> = new Set(SETTABLE_CAPABILITIES)

const getArg = (capability: string): string => {
  const dot = capability.indexOf('.')
  return dot === NOT_FOUND ? capability : capability.slice(0, dot)
}

const tryRegisterFlowCard = (register: () => void): void => {
  try {
    register()
  } catch {
    // Flow card may not exist for this capability
  }
}

/**
 * Runtime capability options per generation: the mode vocabularies
 * differ (comfort −1/−2 exist from V4 up, presence is Pro-only), so
 * pairing details and device init both derive them from the product.
 * @param product - Product generation of the device.
 * @returns The complete option objects, keyed by capability.
 */
export const getCapabilitiesOptions = (
  product: Product,
): CapabilitiesOptions => {
  const values: CapabilitiesOptionsValues<Mode>[] = [
    { id: Mode.comfort, title: { en: 'Comfort', fr: 'Confort' } },
    ...(product >= Product.v4 ?
      [
        {
          id: Mode.comfortMinus1,
          title: { en: 'Comfort -1°C', fr: 'Confort -1°C' },
        },
        {
          id: Mode.comfortMinus2,
          title: { en: 'Comfort -2°C', fr: 'Confort -2°C' },
        },
      ]
    : []),
    { id: Mode.eco, title: { en: 'Eco', fr: 'Éco' } },
    {
      id: Mode.frostProtection,
      title: { en: 'Frost protection', fr: 'Hors-gel' },
    },
    { id: Mode.stop, title: { en: 'Off', fr: 'Désactivé' } },
  ]
  const derogationValues: CapabilitiesOptionsValues<
    CapabilitiesOptions['heater_operation_mode']['values'][number]['id']
  >[] = [
    ...(product >= Product.pro ?
      ([
        {
          id: 'presence',
          title: { en: 'Presence detection', fr: 'Détection de présence' },
        },
      ] as const)
    : []),
    { id: 'boost', title: 'Boost' },
    { id: 'vacation', title: { en: 'Vacation', fr: 'Vacances' } },
    { id: 'off', title: { en: 'Off', fr: 'Désactivé' } },
  ]
  return {
    heater_operation_mode: { values: derogationValues },
    operational_state: { values },
    thermostat_mode: { values },
  }
}

/**
 * The capability set a device of the given generation must carry:
 * V1 exposes the mode only, V2/V4 add derogations, timer and lock,
 * Glow adds temperatures, Pro adds its measures and detections.
 * @param product - Product generation of the device.
 * @returns The required capability ids.
 */
export const getRequiredCapabilities = (product: Product): string[] => [
  'onoff',
  'thermostat_mode',
  ...(product >= Product.v2 ?
    [
      'locked',
      'onoff.timer',
      'heater_operation_mode',
      'derog_end',
      'derog_time',
    ]
  : []),
  ...(product >= Product.glow ?
    ['measure_temperature', 'target_temperature', 'target_temperature.eco']
  : []),
  ...(product >= Product.pro ?
    [
      'alarm_presence',
      'measure_humidity',
      'onoff.window_detection',
      'operational_state',
    ]
  : []),
]

export default class HeatzyDriver extends Driver {
  declare public readonly getDevices: () => HeatzyDevice[]

  declare public readonly homey: Homey.Homey

  declare public readonly manifest: ManifestDriver

  get #api(): AuthenticationAPI {
    return this.homey.app.api
  }

  public override async onInit(): Promise<void> {
    this.#registerFlowListeners()
    await Promise.resolve()
  }

  public override async onPair(session: PairSession): Promise<void> {
    session.setHandler('showView', async (view) => {
      if (view !== 'loading') {
        return
      }
      if (this.#api.isAuthenticated()) {
        await session.showView('list_devices')
        return
      }
      await session.showView('login')
    })
    this.#registerLoginHandler(session)
    session.setHandler('list_devices', async () => this.#discoverDevices())
    await Promise.resolve()
  }

  public override async onRepair(session: PairSession): Promise<void> {
    this.#registerLoginHandler(session)
    await Promise.resolve()
  }

  async #discoverDevices(): Promise<
    {
      capabilities: string[]
      capabilitiesOptions: CapabilitiesOptions
      data: { id: string }
      name: string
    }[]
  > {
    await Promise.resolve()
    return this.homey.app.api.registry
      .getDevices()
      .map(({ id, name, product }) => ({
        capabilities: getRequiredCapabilities(product),
        capabilitiesOptions: getCapabilitiesOptions(product),
        data: { id },
        name,
      }))
  }

  #registerFlowListeners(): void {
    for (const capability of this.manifest.capabilities) {
      tryRegisterFlowCard(() => {
        this.homey.flow
          .getConditionCard(`${capability}_condition`)
          .registerRunListener(
            (
              args: Record<string, unknown> & {
                device: { getCapabilityValue: (key: string) => unknown }
              },
            ) => {
              const value = args.device.getCapabilityValue(capability)
              return typeof value === 'string' || typeof value === 'number' ?
                  value === args[getArg(capability)]
                : value
            },
          )
      })
      if (settableCapabilities.has(capability)) {
        tryRegisterFlowCard(() => {
          this.homey.flow
            .getActionCard(`${capability}_action`)
            .registerRunListener(
              async (
                args: Record<string, unknown> & {
                  device: {
                    triggerCapabilityListener: (
                      key: string,
                      value: unknown,
                    ) => Promise<void>
                  }
                },
              ) => {
                await args.device.triggerCapabilityListener(
                  capability,
                  args[getArg(capability)],
                )
              },
            )
        })
      }
    }
  }

  #registerLoginHandler(session: PairSession): void {
    session.setHandler('login', async (data: LoginCredentials) => {
      try {
        await this.#api.authenticate(data)
        return true
      } catch (error) {
        if (!(error instanceof AuthenticationError)) {
          throw error
        }
        return false
      }
    })
  }
}
