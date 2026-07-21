import type HomeyModule from 'homey'
import type FlowCardAction from 'homey/lib/FlowCardAction'
import type FlowCardCondition from 'homey/lib/FlowCardCondition'
import type PairSession from 'homey/lib/PairSession'
import { AuthenticationError, Product } from '@olivierzal/heatzy-api'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { type InteropModule, assertDefined, mock } from '../helpers.ts'
import HeatzyDriver, {
  getCapabilitiesOptions,
  getRequiredCapabilities,
  SETTABLE_CAPABILITIES,
} from '../../drivers/heatzy/driver.mts'

const MANIFEST_CAPABILITIES = [
  'onoff',
  'onoff.timer',
  'measure_temperature',
  'derog_end',
]

const {
  authenticateMock,
  getDevicesMock,
  isAuthenticatedMock,
  registerRunListenerMock,
  showViewMock,
} = vi.hoisted(() => ({
  authenticateMock: vi.fn<(data: unknown) => Promise<void>>(),
  getDevicesMock: vi.fn<() => readonly unknown[]>().mockReturnValue([]),
  isAuthenticatedMock: vi.fn<() => boolean>().mockReturnValue(false),
  registerRunListenerMock:
    vi.fn<(listener: (args: Record<string, unknown>) => unknown) => void>(),
  showViewMock: vi.fn<(view: string) => Promise<void>>(),
}))

vi.mock(import('homey'), async () => {
  const { mock: mockModule } = await import('../helpers.ts')
  class MockDriver {
    public getDevices = vi.fn<() => readonly unknown[]>().mockReturnValue([])

    public homey = {
      app: {
        api: {
          authenticate: authenticateMock,
          isAuthenticated: isAuthenticatedMock,
          registry: { getDevices: getDevicesMock },
        },
      },
      flow: {
        getActionCard: vi
          .fn<
            (id: string) => {
              registerRunListener: typeof registerRunListenerMock
            }
          >()
          .mockReturnValue({ registerRunListener: registerRunListenerMock }),
        getConditionCard: vi
          .fn<
            (id: string) => {
              registerRunListener: typeof registerRunListenerMock
            }
          >()
          .mockReturnValue({ registerRunListener: registerRunListenerMock }),
      },
    }

    public log = vi.fn<(...args: readonly unknown[]) => void>()

    public manifest = { capabilities: MANIFEST_CAPABILITIES }
  }

  return mockModule<InteropModule<typeof HomeyModule>>({
    default: { Driver: MockDriver },
  })
})

const createDriver = (): HeatzyDriver => {
  const DriverClass = HeatzyDriver as unknown as new () => HeatzyDriver
  return new DriverClass()
}

const captureHandlers = (): {
  handlers: Record<string, (...args: unknown[]) => unknown>
  session: PairSession
  getHandler: (event: string) => (...args: unknown[]) => unknown
} => {
  const handlers: Record<string, (...args: unknown[]) => unknown> = {}
  const session = mock<PairSession>({
    setHandler: vi
      .fn<(event: string, handler: (...args: unknown[]) => unknown) => void>()
      .mockImplementation(
        (event: string, handler: (...args: unknown[]) => unknown) => {
          handlers[event] = handler
        },
      ),
    showView: showViewMock,
  })
  const getHandler = (event: string): ((...args: unknown[]) => unknown) => {
    const handler = handlers[event]
    assertDefined(handler)
    return handler
  }
  return { getHandler, handlers, session }
}

const registerConditionListeners = async (
  driver: HeatzyDriver,
): Promise<Record<string, (args: Record<string, unknown>) => unknown>> => {
  const listeners: Record<string, (args: Record<string, unknown>) => unknown> =
    {}
  vi.spyOn(driver.homey.flow, 'getConditionCard').mockImplementation(
    (cardName: string) =>
      mock<FlowCardCondition>({
        registerRunListener: (
          listener: (args: Record<string, unknown>) => unknown,
        ): void => {
          listeners[cardName] = listener
        },
      }),
  )
  await driver.onInit()
  return listeners
}

const registerActionListeners = async (
  driver: HeatzyDriver,
): Promise<
  Record<string, (args: Record<string, unknown>) => Promise<void>>
> => {
  const listeners: Record<
    string,
    (args: Record<string, unknown>) => Promise<void>
  > = {}
  vi.spyOn(driver.homey.flow, 'getActionCard').mockImplementation(
    (cardName: string) =>
      mock<FlowCardAction>({
        registerRunListener: (
          listener: (args: Record<string, unknown>) => Promise<void>,
        ): void => {
          listeners[cardName] = listener
        },
      }),
  )
  await driver.onInit()
  return listeners
}

const V2_CAPABILITIES = [
  'onoff',
  'thermostat_mode',
  'locked',
  'onoff.timer',
  'heater_operation_mode',
  'derog_end',
  'derog_time',
]

const GLOW_CAPABILITIES = [
  ...V2_CAPABILITIES,
  'measure_temperature',
  'target_temperature',
  'target_temperature.eco',
]

const PRO_CAPABILITIES = [
  ...GLOW_CAPABILITIES,
  'alarm_presence',
  'measure_humidity',
  'onoff.window_detection',
  'operational_state',
]

const MODE_IDS_BASE = ['cft', 'eco', 'fro', 'stop']
const MODE_IDS_OFFSET = ['cft', 'cft1', 'cft2', 'eco', 'fro', 'stop']
const DEROGATION_IDS = ['boost', 'vacation', 'off']
const DEROGATION_IDS_PRO = ['presence', 'boost', 'vacation', 'off']

describe(getRequiredCapabilities, () => {
  it.each([
    [Product.v1, ['onoff', 'thermostat_mode']],
    [Product.v2, V2_CAPABILITIES],
    [Product.v4, V2_CAPABILITIES],
    [Product.glow, GLOW_CAPABILITIES],
    [Product.pro, PRO_CAPABILITIES],
  ])(
    'should list the required capabilities for product %i',
    (product, expected) => {
      expect(getRequiredCapabilities(product)).toStrictEqual(expected)
    },
  )
})

describe(getCapabilitiesOptions, () => {
  it.each([
    [Product.v1, MODE_IDS_BASE, DEROGATION_IDS],
    [Product.v2, MODE_IDS_BASE, DEROGATION_IDS],
    [Product.v4, MODE_IDS_OFFSET, DEROGATION_IDS],
    [Product.glow, MODE_IDS_OFFSET, DEROGATION_IDS],
    [Product.pro, MODE_IDS_OFFSET, DEROGATION_IDS_PRO],
  ])(
    'should build the mode and derogation vocabularies for product %i',
    (product, modeIds, derogationIds) => {
      const options = getCapabilitiesOptions(product)

      expect(
        options.operational_state.values.map((value) => value.id),
      ).toStrictEqual(modeIds)
      expect(
        options.thermostat_mode.values.map((value) => value.id),
      ).toStrictEqual(modeIds)
      expect(
        options.heater_operation_mode.values.map((value) => value.id),
      ).toStrictEqual(derogationIds)
    },
  )

  it('should title every entry without offsets or presence below V4', () => {
    const modeValues = [
      { id: 'cft', title: { en: 'Comfort', fr: 'Confort' } },
      { id: 'eco', title: { en: 'Eco', fr: 'Éco' } },
      { id: 'fro', title: { en: 'Frost protection', fr: 'Hors-gel' } },
      { id: 'stop', title: { en: 'Off', fr: 'Désactivé' } },
    ]

    expect(getCapabilitiesOptions(Product.v1)).toStrictEqual({
      heater_operation_mode: {
        values: [
          { id: 'boost', title: 'Boost' },
          { id: 'vacation', title: { en: 'Vacation', fr: 'Vacances' } },
          { id: 'off', title: { en: 'Off', fr: 'Désactivé' } },
        ],
      },
      operational_state: { values: modeValues },
      thermostat_mode: { values: modeValues },
    })
  })

  it('should title the offset modes and presence derogation for a Pro product', () => {
    const modeValues = [
      { id: 'cft', title: { en: 'Comfort', fr: 'Confort' } },
      { id: 'cft1', title: { en: 'Comfort -1°C', fr: 'Confort -1°C' } },
      { id: 'cft2', title: { en: 'Comfort -2°C', fr: 'Confort -2°C' } },
      { id: 'eco', title: { en: 'Eco', fr: 'Éco' } },
      { id: 'fro', title: { en: 'Frost protection', fr: 'Hors-gel' } },
      { id: 'stop', title: { en: 'Off', fr: 'Désactivé' } },
    ]

    expect(getCapabilitiesOptions(Product.pro)).toStrictEqual({
      heater_operation_mode: {
        values: [
          {
            id: 'presence',
            title: { en: 'Presence detection', fr: 'Détection de présence' },
          },
          { id: 'boost', title: 'Boost' },
          { id: 'vacation', title: { en: 'Vacation', fr: 'Vacances' } },
          { id: 'off', title: { en: 'Off', fr: 'Désactivé' } },
        ],
      },
      operational_state: { values: modeValues },
      thermostat_mode: { values: modeValues },
    })
  })
})

describe('settable capabilities', () => {
  it('should enumerate every wire-writable capability', () => {
    expect(SETTABLE_CAPABILITIES).toStrictEqual([
      'derog_time',
      'heater_operation_mode',
      'locked',
      'onoff',
      'onoff.timer',
      'onoff.window_detection',
      'target_temperature',
      'target_temperature.eco',
      'thermostat_mode',
    ])
  })
})

describe(HeatzyDriver, () => {
  let driver: HeatzyDriver

  beforeEach(() => {
    vi.clearAllMocks()

    driver = createDriver()
  })

  describe('flow listener registration', () => {
    it.each(MANIFEST_CAPABILITIES)(
      'should register a condition card for %s',
      async (capability) => {
        await driver.onInit()

        expect(driver.homey.flow.getConditionCard).toHaveBeenCalledWith(
          `${capability}_condition`,
        )
      },
    )

    it.each(['onoff', 'onoff.timer'])(
      'should register an action card for settable capability %s',
      async (capability) => {
        await driver.onInit()

        expect(driver.homey.flow.getActionCard).toHaveBeenCalledWith(
          `${capability}_action`,
        )
      },
    )

    it.each(['measure_temperature', 'derog_end'])(
      'should not register an action card for non-settable capability %s',
      async (capability) => {
        await driver.onInit()

        expect(driver.homey.flow.getActionCard).not.toHaveBeenCalledWith(
          `${capability}_action`,
        )
      },
    )

    it('should compare a string capability value against the dotted arg stem', async () => {
      const listeners = await registerConditionListeners(driver)
      const listener = listeners['onoff.timer_condition']
      assertDefined(listener)

      expect(
        listener({
          device: {
            getCapabilityValue: vi
              .fn<(capability: string) => unknown>()
              .mockReturnValue('active'),
          },
          onoff: 'active',
        }),
      ).toBe(true)
      expect(
        listener({
          device: {
            getCapabilityValue: vi
              .fn<(capability: string) => unknown>()
              .mockReturnValue('active'),
          },
          onoff: 'idle',
        }),
      ).toBe(false)
    })

    it('should compare a number capability value against the matching arg', async () => {
      const listeners = await registerConditionListeners(driver)
      const listener = listeners.measure_temperature_condition
      assertDefined(listener)

      expect(
        listener({
          device: {
            getCapabilityValue: vi
              .fn<(capability: string) => unknown>()
              .mockReturnValue(21),
          },
          measure_temperature: 21,
        }),
      ).toBe(true)
    })

    it('should return a boolean capability value unchanged', async () => {
      const listeners = await registerConditionListeners(driver)
      const listener = listeners.onoff_condition
      assertDefined(listener)

      expect(
        listener({
          device: {
            getCapabilityValue: vi
              .fn<(capability: string) => unknown>()
              .mockReturnValue(true),
          },
          onoff: false,
        }),
      ).toBe(true)
    })

    it('should trigger the capability listener with the matching arg', async () => {
      const listeners = await registerActionListeners(driver)
      const listener = listeners.onoff_action
      assertDefined(listener)
      const triggerCapabilityListener = vi
        .fn<(capability: string, value: unknown) => Promise<void>>()
        .mockResolvedValue()
      await listener({ device: { triggerCapabilityListener }, onoff: true })

      expect(triggerCapabilityListener).toHaveBeenCalledWith('onoff', true)
    })

    it('should trigger a dotted capability listener with the arg stem', async () => {
      const listeners = await registerActionListeners(driver)
      const listener = listeners['onoff.timer_action']
      assertDefined(listener)
      const triggerCapabilityListener = vi
        .fn<(capability: string, value: unknown) => Promise<void>>()
        .mockResolvedValue()
      await listener({ device: { triggerCapabilityListener }, onoff: false })

      expect(triggerCapabilityListener).toHaveBeenCalledWith(
        'onoff.timer',
        false,
      )
    })

    it('should absorb a missing condition card', async () => {
      vi.spyOn(driver.homey.flow, 'getConditionCard').mockImplementation(() => {
        throw new Error('Card not found')
      })

      await expect(driver.onInit()).resolves.toBeUndefined()
    })

    it('should absorb a missing action card', async () => {
      vi.spyOn(driver.homey.flow, 'getActionCard').mockImplementation(() => {
        throw new Error('Card not found')
      })

      await expect(driver.onInit()).resolves.toBeUndefined()
    })
  })

  describe('onPair', () => {
    it('should set showView, login, and list_devices handlers', async () => {
      const { handlers, session } = captureHandlers()
      await driver.onPair(session)

      expect(Object.keys(handlers)).toStrictEqual([
        'showView',
        'login',
        'list_devices',
      ])
    })

    it('should show list_devices when authenticated on the loading view', async () => {
      isAuthenticatedMock.mockReturnValue(true)
      const { getHandler, session } = captureHandlers()
      await driver.onPair(session)
      await getHandler('showView')('loading')

      expect(showViewMock).toHaveBeenCalledWith('list_devices')
    })

    it('should show login when not authenticated on the loading view', async () => {
      isAuthenticatedMock.mockReturnValue(false)
      const { getHandler, session } = captureHandlers()
      await driver.onPair(session)
      await getHandler('showView')('loading')

      expect(showViewMock).toHaveBeenCalledWith('login')
    })

    it('should ignore a non-loading view', async () => {
      const { getHandler, session } = captureHandlers()
      await driver.onPair(session)
      await getHandler('showView')('list_devices')

      expect(showViewMock).not.toHaveBeenCalled()
    })

    it('should return true when authentication succeeds', async () => {
      authenticateMock.mockResolvedValue()
      const { getHandler, session } = captureHandlers()
      await driver.onPair(session)

      await expect(
        getHandler('login')({ password: 'pass', username: 'user' }),
      ).resolves.toBe(true)
      expect(authenticateMock).toHaveBeenCalledWith({
        password: 'pass',
        username: 'user',
      })
    })

    it('should return false when authentication throws AuthenticationError', async () => {
      authenticateMock.mockRejectedValue(new AuthenticationError('invalid'))
      const { getHandler, session } = captureHandlers()
      await driver.onPair(session)

      await expect(
        getHandler('login')({ password: 'wrong', username: 'user' }),
      ).resolves.toBe(false)
    })

    it('should rethrow non-authentication errors from the login handler', async () => {
      const error = new Error('network down')
      authenticateMock.mockRejectedValue(error)
      const { getHandler, session } = captureHandlers()
      await driver.onPair(session)

      await expect(
        getHandler('login')({ password: 'pass', username: 'user' }),
      ).rejects.toBe(error)
    })

    it('should map registry devices to pairing details per product', async () => {
      getDevicesMock.mockReturnValue([
        { id: 'a', name: 'V1 device', product: Product.v1 },
        { id: 'b', name: 'Pro device', product: Product.pro },
      ])
      const { getHandler, session } = captureHandlers()
      await driver.onPair(session)
      const devices = await getHandler('list_devices')()

      expect(devices).toStrictEqual([
        {
          capabilities: getRequiredCapabilities(Product.v1),
          capabilitiesOptions: getCapabilitiesOptions(Product.v1),
          data: { id: 'a' },
          name: 'V1 device',
        },
        {
          capabilities: getRequiredCapabilities(Product.pro),
          capabilitiesOptions: getCapabilitiesOptions(Product.pro),
          data: { id: 'b' },
          name: 'Pro device',
        },
      ])
    })
  })

  describe('onRepair', () => {
    it('should register only the login handler', async () => {
      const { handlers, session } = captureHandlers()
      await driver.onRepair(session)

      expect(Object.keys(handlers)).toStrictEqual(['login'])
    })

    it('should authenticate through the repair login handler', async () => {
      authenticateMock.mockResolvedValue()
      const { getHandler, session } = captureHandlers()
      await driver.onRepair(session)

      await expect(
        getHandler('login')({ password: 'pass', username: 'user' }),
      ).resolves.toBe(true)
      expect(authenticateMock).toHaveBeenCalledWith({
        password: 'pass',
        username: 'user',
      })
    })
  })
})
