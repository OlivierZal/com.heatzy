import type HomeyModule from 'homey'
import {
  type PostAttributes,
  AuthenticationError,
  DerogationMode,
  getTargetTemperature,
  Mode,
  Product,
  Switch,
} from '@olivierzal/heatzy-api'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type HeatzyDriver from '../../drivers/heatzy/driver.mts'
import { SETTABLE_CAPABILITIES } from '../../drivers/heatzy/driver.mts'
import { NotFoundError } from '../../lib/errors.mts'
import {
  type InteropModule,
  assertDefined,
  getMockCallArg,
  mock,
  settleDetached,
} from '../helpers.ts'
import HeatzyDevice from '../../drivers/heatzy/device.mts'

const DEBOUNCE_DELAY = 1000

const ALL_CAPABILITIES: readonly string[] = [
  'alarm_presence',
  'derog_end',
  'derog_time',
  'heater_operation_mode',
  'locked',
  'measure_humidity',
  'measure_temperature',
  'onoff',
  'onoff.timer',
  'onoff.window_detection',
  'operational_state',
  'target_temperature',
  'target_temperature.eco',
  'thermostat_mode',
]

const {
  clearTimeoutMock,
  getFacadeMock,
  getSettingMock,
  getStoreValueMock,
  realtimeMock,
  registerMultipleCapabilityListenerMock,
  setTimeoutMock,
  setValuesMock,
  superAddCapabilityMock,
  superErrorMock,
  superLogMock,
  superRemoveCapabilityMock,
  superSetWarningMock,
  triggerCapabilityListenerMock,
} = vi.hoisted(() => ({
  clearTimeoutMock: vi.fn<(timer: unknown) => void>(),
  getFacadeMock: vi.fn<(id: string) => unknown>(),
  getSettingMock: vi.fn<(key: string) => unknown>(),
  getStoreValueMock: vi.fn<(key: string) => unknown>(),
  realtimeMock: vi.fn<(event: string, data: unknown) => void>(),
  registerMultipleCapabilityListenerMock:
    vi.fn<
      (
        capabilities: readonly string[],
        listener: (values: Record<string, unknown>) => Promise<void>,
        delay?: number,
      ) => void
    >(),
  setTimeoutMock:
    vi.fn<(callback: () => Promise<void>, ms: number) => unknown>(),
  setValuesMock: vi.fn<(data: Record<string, unknown>) => Promise<unknown>>(),
  superAddCapabilityMock: vi.fn<(...args: readonly unknown[]) => unknown>(),
  superErrorMock: vi.fn<(...args: readonly unknown[]) => unknown>(),
  superLogMock: vi.fn<(...args: readonly unknown[]) => unknown>(),
  superRemoveCapabilityMock: vi.fn<(...args: readonly unknown[]) => unknown>(),
  superSetWarningMock: vi.fn<(...args: readonly unknown[]) => unknown>(),
  triggerCapabilityListenerMock:
    vi.fn<(capability: string, value: unknown) => Promise<void>>(),
}))

vi.mock(import('homey'), async () => {
  const { createMockDeviceClass, mock: mockModule } =
    await import('../helpers.ts')
  return mockModule<InteropModule<typeof HomeyModule>>({
    default: {
      Device: createMockDeviceClass({
        overrides: {
          getSetting: getSettingMock,
          getStoreValue: getStoreValueMock,
          homey: {
            api: { realtime: realtimeMock },
            app: { getFacade: getFacadeMock },
            clearTimeout: clearTimeoutMock,
            setTimeout: setTimeoutMock,
          },
          registerMultipleCapabilityListener:
            registerMultipleCapabilityListenerMock,
          triggerCapabilityListener: triggerCapabilityListenerMock,
        },
        superMocks: {
          addCapability: superAddCapabilityMock,
          error: superErrorMock,
          log: superLogMock,
          removeCapability: superRemoveCapabilityMock,
          setWarning: superSetWarningMock,
        },
      }),
      Driver: vi.fn<() => void>(),
    },
  })
})

interface ToConfig {
  readonly product?: Product | undefined
  readonly settings?: Record<string, unknown> | undefined
  readonly store?: Record<string, unknown> | undefined
}

const createFacade = (
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  comfortTemperature: 21,
  currentHumidity: 55,
  currentMode: Mode.comfort,
  currentTemperature: 20,
  derogationEndString: 'END',
  derogationMode: DerogationMode.boost,
  derogationTime: 60,
  ecoTemperature: 18,
  isDetectingOpenWindow: true,
  isLocked: true,
  isOn: true,
  isPresence: false,
  isTimer: false,
  mode: Mode.comfort,
  previousMode: Mode.eco,
  product: Product.v2,
  setValues: setValuesMock,
  ...overrides,
})

const configureFacade = (overrides: Record<string, unknown> = {}): void => {
  getFacadeMock.mockReturnValue(createFacade(overrides))
}

const createDriver = (
  capabilities: readonly string[] = ALL_CAPABILITIES,
): HeatzyDriver =>
  mock<HeatzyDriver>({ manifest: mock({ capabilities: [...capabilities] }) })

const createDevice = (driver: HeatzyDriver = createDriver()): HeatzyDevice => {
  const device = new HeatzyDevice()
  Object.defineProperty(device, 'driver', { configurable: true, value: driver })
  return device
}

const getCallback = (): ((
  values: Record<string, unknown>,
) => Promise<void>) => {
  const call = registerMultipleCapabilityListenerMock.mock.calls.at(-1)
  assertDefined(call)
  return call[1]
}

const runToDevice = async (
  values: Record<string, unknown>,
  { product = Product.v2, settings = {}, store = {} }: ToConfig = {},
): Promise<PostAttributes | undefined> => {
  getSettingMock.mockImplementation((key: string) => settings[key])
  getStoreValueMock.mockImplementation((key: string) => store[key])
  configureFacade({ product })
  const device = createDevice()
  await device.onInit()
  await settleDetached()
  setValuesMock.mockClear()
  const callback = getCallback()
  await callback(values)
  return setValuesMock.mock.calls.at(0)?.at(0)
}

const toDeviceCases: readonly {
  readonly expected: PostAttributes | undefined
  readonly name: string
  readonly values: Record<string, unknown>
  readonly product?: Product
  readonly settings?: Record<string, unknown>
  readonly store?: Record<string, unknown>
}[] = [
  {
    expected: { derog_time: 30 },
    name: 'derog_time to a number',
    values: { derog_time: '30' },
  },
  {
    expected: { derog_mode: DerogationMode.boost },
    name: 'a valid heater_operation_mode to derog_mode',
    values: { heater_operation_mode: 'boost' },
  },
  {
    expected: undefined,
    name: 'an invalid heater_operation_mode to nothing',
    values: { heater_operation_mode: 'invalid' },
  },
  {
    expected: undefined,
    name: 'a non-string heater_operation_mode to nothing',
    values: { heater_operation_mode: 5 },
  },
  {
    expected: { lock_switch: Switch.on },
    name: 'locked on for a non-Glow product',
    product: Product.v2,
    values: { locked: true },
  },
  {
    expected: { lock_switch: Switch.off },
    name: 'locked off for a non-Glow product',
    product: Product.v2,
    values: { locked: false },
  },
  {
    expected: { LOCK_C: Switch.on },
    name: 'locked on for a Glow product',
    product: Product.glow,
    values: { locked: true },
  },
  {
    expected: { LOCK_C: Switch.off },
    name: 'locked off for a Glow product',
    product: Product.glow,
    values: { locked: false },
  },
  {
    expected: { mode: Mode.eco },
    name: 'onoff on for a non-Glow product to the on mode',
    product: Product.v2,
    values: { onoff: true },
  },
  {
    expected: { mode: Mode.stop },
    name: 'onoff off for a non-Glow product to stop',
    product: Product.v2,
    values: { onoff: false },
  },
  {
    expected: { mode: Mode.eco },
    name: 'onoff off coerced on by always_on',
    product: Product.v2,
    settings: { always_on: true },
    values: { onoff: false },
  },
  {
    expected: { on_off: Switch.on },
    name: 'onoff on for a Glow product',
    product: Product.glow,
    values: { onoff: true },
  },
  {
    expected: { on_off: Switch.off },
    name: 'onoff off for a Glow product',
    product: Product.glow,
    values: { onoff: false },
  },
  {
    expected: { mode: Mode.comfort },
    name: 'onoff on restoring the stored previous mode',
    product: Product.v2,
    settings: { on_mode: 'previous' },
    store: { previousMode: Mode.comfort },
    values: { onoff: true },
  },
  {
    expected: { mode: Mode.eco },
    name: 'onoff on falling back to eco without a previous mode',
    product: Product.v2,
    settings: { on_mode: 'previous' },
    store: { previousMode: null },
    values: { onoff: true },
  },
  {
    expected: { mode: Mode.comfort },
    name: 'onoff on using an explicit on mode',
    product: Product.v2,
    settings: { on_mode: Mode.comfort },
    values: { onoff: true },
  },
  {
    expected: { timer_switch: Switch.on },
    name: 'onoff.timer on',
    values: { 'onoff.timer': true },
  },
  {
    expected: { timer_switch: Switch.off },
    name: 'onoff.timer off',
    values: { 'onoff.timer': false },
  },
  {
    expected: { window_switch: Switch.on },
    name: 'onoff.window_detection on',
    values: { 'onoff.window_detection': true },
  },
  {
    expected: { window_switch: Switch.off },
    name: 'onoff.window_detection off',
    values: { 'onoff.window_detection': false },
  },
  {
    expected: getTargetTemperature(Product.v2, Mode.comfort, 20),
    name: 'target_temperature for a non-Glow product',
    product: Product.v2,
    values: { target_temperature: 20 },
  },
  {
    expected: getTargetTemperature(Product.glow, Mode.comfort, 25),
    name: 'target_temperature for a Glow product within one byte',
    product: Product.glow,
    values: { target_temperature: 25 },
  },
  {
    expected: getTargetTemperature(Product.glow, Mode.comfort, 26),
    name: 'target_temperature for a Glow product across a byte',
    product: Product.glow,
    values: { target_temperature: 26 },
  },
  {
    expected: getTargetTemperature(Product.v2, Mode.eco, 18),
    name: 'target_temperature.eco for a non-Glow product',
    product: Product.v2,
    values: { 'target_temperature.eco': 18 },
  },
  {
    expected: { mode: Mode.comfort },
    name: 'thermostat_mode to a mode',
    values: { thermostat_mode: Mode.comfort },
  },
  {
    expected: { mode: Mode.stop },
    name: 'thermostat_mode stop to the off value',
    product: Product.v2,
    values: { thermostat_mode: Mode.stop },
  },
  {
    expected: { mode: Mode.eco },
    name: 'thermostat_mode stop to the on value with always_on',
    product: Product.v2,
    settings: { always_on: true },
    values: { thermostat_mode: Mode.stop },
  },
  {
    expected: undefined,
    name: 'an invalid thermostat_mode to nothing',
    values: { thermostat_mode: 'invalid' },
  },
  {
    expected: undefined,
    name: 'a non-string thermostat_mode to nothing',
    values: { thermostat_mode: 42 },
  },
]

describe(HeatzyDevice, () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getSettingMock.mockReturnValue(undefined)
    getStoreValueMock.mockReturnValue(undefined)
    setValuesMock.mockResolvedValue(undefined)
    setTimeoutMock.mockReturnValue('timer')
    configureFacade()
  })

  describe('device identifier', () => {
    it('should return the device id from getData', () => {
      expect(createDevice().id).toBe('device-1')
    })
  })

  describe('initialization', () => {
    it('should clear the warning, register listeners and ensure the device', async () => {
      const device = createDevice()
      await device.onInit()
      await settleDetached()

      expect(superSetWarningMock).toHaveBeenCalledWith(null)
      expect(registerMultipleCapabilityListenerMock).toHaveBeenCalledWith(
        [...SETTABLE_CAPABILITIES],
        expect.any(Function),
        DEBOUNCE_DELAY,
      )
      expect(getFacadeMock).toHaveBeenCalledWith('device-1')
    })

    it('should apply capability options and sync during the detached init', async () => {
      configureFacade({ product: Product.pro })
      const device = createDevice()
      await device.onInit()
      await settleDetached()

      expect(device.setCapabilityOptions).toHaveBeenCalledWith(
        'thermostat_mode',
        expect.any(Object),
      )
      expect(realtimeMock).toHaveBeenCalledWith('deviceupdate', null)
    })

    it('should apply options only for present capabilities', async () => {
      configureFacade({ product: Product.pro })
      const device = createDevice()
      vi.spyOn(device, 'hasCapability').mockImplementation(
        (capability: string) => capability === 'thermostat_mode',
      )
      await device.onInit()
      await settleDetached()

      expect(device.setCapabilityOptions).toHaveBeenCalledWith(
        'thermostat_mode',
        expect.any(Object),
      )
      expect(device.setCapabilityOptions).not.toHaveBeenCalledWith(
        'operational_state',
        expect.anything(),
      )
    })

    it('should log a detached init failure', async () => {
      const device = createDevice()
      const failure = new Error('detached failed')
      vi.spyOn(device, 'syncFromDevice').mockRejectedValue(failure)
      await device.onInit()
      await settleDetached()

      expect(superErrorMock).toHaveBeenCalledWith(
        'Test device',
        '-',
        'Deferred device init failed:',
        failure,
      )
    })
  })

  describe('capability setup', () => {
    it('should add missing and remove stale capabilities within the manifest', async () => {
      configureFacade({ product: Product.v2 })
      const device = createDevice(
        createDriver([
          'onoff',
          'thermostat_mode',
          'locked',
          'onoff.timer',
          'heater_operation_mode',
          'derog_time',
        ]),
      )
      vi.spyOn(device, 'getCapabilities').mockReturnValue([
        'stale_cap',
        'onoff',
      ])
      vi.spyOn(device, 'hasCapability').mockImplementation(
        (capability: string) =>
          capability === 'stale_cap' || capability === 'onoff',
      )
      await device.onInit()
      await settleDetached()

      expect(superRemoveCapabilityMock).toHaveBeenCalledWith('stale_cap')
      expect(superAddCapabilityMock).toHaveBeenCalledWith('thermostat_mode')
      expect(superAddCapabilityMock).not.toHaveBeenCalledWith('derog_end')
    })
  })

  describe('ensuring the device facade', () => {
    it('should cache the facade across calls', async () => {
      const device = createDevice()
      const first = await device.ensureDevice()
      const second = await device.ensureDevice()

      expect(first).toBe(second)
      expect(getFacadeMock).toHaveBeenCalledTimes(1)
    })

    it('should warn and return null on an API error', async () => {
      getFacadeMock.mockImplementation(() => {
        throw new AuthenticationError('auth failed')
      })
      const device = createDevice()
      const result = await device.ensureDevice()

      expect(result).toBeNull()
      expect(superSetWarningMock).toHaveBeenCalledWith('auth failed')
    })

    it('should warn and return null on a not-found error', async () => {
      getFacadeMock.mockImplementation(() => {
        throw new NotFoundError('not found')
      })
      const device = createDevice()
      const result = await device.ensureDevice()

      expect(result).toBeNull()
      expect(superSetWarningMock).toHaveBeenCalledWith('not found')
    })

    it('should log and not warn on an unexpected error', async () => {
      getFacadeMock.mockImplementation(() => {
        throw new TypeError('programming error')
      })
      const device = createDevice()
      const result = await device.ensureDevice()

      expect(result).toBeNull()
      expect(superSetWarningMock).not.toHaveBeenCalled()
      expect(superErrorMock).toHaveBeenCalledWith(
        'Test device',
        '-',
        'Unexpected error while ensuring device:',
        expect.any(TypeError),
      )
    })
  })

  describe('capability-to-device conversion', () => {
    it.each(toDeviceCases)(
      'should convert $name',
      async ({ expected, product, settings, store, values }) => {
        const result = await runToDevice(values, { product, settings, store })

        expect(result).toStrictEqual(expected)
      },
    )
  })

  describe('sending an update', () => {
    it('should do nothing when the device is unavailable', async () => {
      getFacadeMock.mockImplementation(() => {
        throw new NotFoundError('not found')
      })
      const device = createDevice()
      await device.onInit()
      setValuesMock.mockClear()
      setTimeoutMock.mockClear()
      const callback = getCallback()
      await callback({ onoff: true })

      expect(setValuesMock).not.toHaveBeenCalled()
      expect(setTimeoutMock).not.toHaveBeenCalled()
    })

    it('should warn when the update rejects', async () => {
      configureFacade({ product: Product.v2 })
      setValuesMock.mockRejectedValueOnce(new Error('update failed'))
      const device = createDevice()
      await device.onInit()
      await settleDetached()
      const callback = getCallback()
      await callback({ onoff: true })

      expect(superSetWarningMock).toHaveBeenCalledWith('update failed')
    })

    it('should skip the write but still schedule a sync when nothing changes', async () => {
      configureFacade({ product: Product.v2 })
      const device = createDevice()
      await device.onInit()
      await settleDetached()
      setValuesMock.mockClear()
      setTimeoutMock.mockClear()
      const callback = getCallback()
      await callback({ heater_operation_mode: 'invalid' })

      expect(setValuesMock).not.toHaveBeenCalled()
      expect(setTimeoutMock).toHaveBeenCalledTimes(1)
    })
  })

  describe('post-update sync', () => {
    it('should run the delayed sync', async () => {
      configureFacade({ product: Product.v2 })
      const device = createDevice()
      await device.onInit()
      await settleDetached()
      vi.mocked(device.setCapabilityValue).mockClear()
      const callback = getCallback()
      await callback({ onoff: true })
      const scheduled = getMockCallArg<() => Promise<void>>(
        setTimeoutMock,
        -1,
        0,
      )
      await scheduled()

      expect(device.setCapabilityValue).toHaveBeenCalledWith('onoff', true)
    })

    it('should log instead of rejecting when the delayed sync fails', async () => {
      configureFacade({ product: Product.v2 })
      const device = createDevice()
      await device.onInit()
      await settleDetached()
      const callback = getCallback()
      await callback({ onoff: true })
      const scheduled = getMockCallArg<() => Promise<void>>(
        setTimeoutMock,
        -1,
        0,
      )
      const failure = new Error('sync failed')
      vi.spyOn(device, 'syncFromDevice').mockRejectedValue(failure)

      await expect(scheduled()).resolves.toBeUndefined()
      expect(superErrorMock).toHaveBeenCalledWith(
        'Test device',
        '-',
        'Post-update sync failed:',
        failure,
      )
    })

    it('should cancel a pending sync on the next update', async () => {
      configureFacade({ product: Product.v2 })
      const device = createDevice()
      await device.onInit()
      await settleDetached()
      const callback = getCallback()
      await callback({ onoff: true })
      clearTimeoutMock.mockClear()
      await callback({ onoff: false })

      expect(clearTimeoutMock).toHaveBeenCalledWith('timer')
    })

    it('should cancel a pending sync on deletion', async () => {
      configureFacade({ product: Product.v2 })
      const device = createDevice()
      await device.onInit()
      await settleDetached()
      const callback = getCallback()
      await callback({ onoff: true })
      clearTimeoutMock.mockClear()
      device.onDeleted()

      expect(clearTimeoutMock).toHaveBeenCalledWith('timer')
    })

    it('should do nothing on deletion without a pending sync', () => {
      createDevice().onDeleted()

      expect(clearTimeoutMock).not.toHaveBeenCalled()
    })
  })

  describe('synchronizing from the device', () => {
    it('should set values across every tier for a Pro product', async () => {
      configureFacade({ product: Product.pro })
      const device = createDevice()
      await device.syncFromDevice()
      await settleDetached()

      expect(realtimeMock).toHaveBeenCalledWith('deviceupdate', null)
      expect(device.setCapabilityValue).toHaveBeenCalledWith('onoff', true)
      expect(device.setCapabilityValue).toHaveBeenCalledWith(
        'thermostat_mode',
        Mode.comfort,
      )
      expect(device.setCapabilityValue).toHaveBeenCalledWith('derog_end', 'END')
      expect(device.setCapabilityValue).toHaveBeenCalledWith(
        'heater_operation_mode',
        'boost',
      )
      expect(device.setCapabilityValue).toHaveBeenCalledWith('derog_time', '60')
      expect(device.setCapabilityValue).toHaveBeenCalledWith('locked', true)
      expect(device.setCapabilityValue).toHaveBeenCalledWith(
        'onoff.timer',
        false,
      )
      expect(device.setCapabilityValue).toHaveBeenCalledWith(
        'measure_temperature',
        20,
      )
      expect(device.setCapabilityValue).toHaveBeenCalledWith(
        'target_temperature',
        21,
      )
      expect(device.setCapabilityValue).toHaveBeenCalledWith(
        'target_temperature.eco',
        18,
      )
      expect(device.setCapabilityValue).toHaveBeenCalledWith(
        'alarm_presence',
        false,
      )
      expect(device.setCapabilityValue).toHaveBeenCalledWith(
        'measure_humidity',
        55,
      )
      expect(device.setCapabilityValue).toHaveBeenCalledWith(
        'onoff.window_detection',
        true,
      )
      expect(device.setCapabilityValue).toHaveBeenCalledWith(
        'operational_state',
        Mode.comfort,
      )
      expect(device.setStoreValue).toHaveBeenCalledWith(
        'previousMode',
        Mode.eco,
      )
    })

    it('should set only the mode tier for a V1 product', async () => {
      configureFacade({
        isOn: false,
        mode: Mode.stop,
        previousMode: null,
        product: Product.v1,
      })
      const device = createDevice()
      await device.syncFromDevice()
      await settleDetached()

      expect(device.setCapabilityValue).toHaveBeenCalledWith('onoff', false)
      expect(device.setCapabilityValue).toHaveBeenCalledWith(
        'thermostat_mode',
        Mode.stop,
      )
      expect(device.setCapabilityValue).not.toHaveBeenCalledWith(
        'derog_end',
        expect.anything(),
      )
      expect(device.setCapabilityValue).not.toHaveBeenCalledWith(
        'measure_temperature',
        expect.anything(),
      )
      expect(device.setCapabilityValue).not.toHaveBeenCalledWith(
        'alarm_presence',
        expect.anything(),
      )
      expect(device.setStoreValue).toHaveBeenCalledWith('previousMode', null)
    })

    it('should return early when the device is unavailable', async () => {
      getFacadeMock.mockImplementation(() => {
        throw new NotFoundError('not found')
      })
      const device = createDevice()
      realtimeMock.mockClear()
      await device.syncFromDevice()

      expect(realtimeMock).not.toHaveBeenCalled()
    })
  })

  describe('settings changes', () => {
    it('should trigger onoff when always_on turns on and onoff exists', async () => {
      const device = createDevice()
      vi.spyOn(device, 'hasCapability').mockReturnValue(true)
      await device.onSettings({
        changedKeys: ['always_on'],
        newSettings: { always_on: true },
      })

      expect(triggerCapabilityListenerMock).toHaveBeenCalledWith('onoff', true)
    })

    it('should ignore always_on when onoff is absent', async () => {
      const device = createDevice()
      vi.spyOn(device, 'hasCapability').mockReturnValue(false)
      await device.onSettings({
        changedKeys: ['always_on'],
        newSettings: { always_on: true },
      })

      expect(triggerCapabilityListenerMock).not.toHaveBeenCalled()
    })

    it('should ignore always_on turning off', async () => {
      const device = createDevice()
      await device.onSettings({
        changedKeys: ['always_on'],
        newSettings: { always_on: false },
      })

      expect(triggerCapabilityListenerMock).not.toHaveBeenCalled()
    })

    it('should ignore other setting changes', async () => {
      const device = createDevice()
      await device.onSettings({
        changedKeys: ['on_mode'],
        newSettings: { on_mode: 'previous' },
      })

      expect(triggerCapabilityListenerMock).not.toHaveBeenCalled()
    })
  })

  describe('uninitialization', () => {
    it('should clear a pending sync and resolve', async () => {
      configureFacade({ product: Product.v2 })
      const device = createDevice()
      await device.onInit()
      await settleDetached()
      const callback = getCallback()
      await callback({ onoff: true })
      clearTimeoutMock.mockClear()

      await expect(device.onUninit()).resolves.toBeUndefined()
      expect(clearTimeoutMock).toHaveBeenCalledWith('timer')
    })

    it('should resolve without a pending sync', async () => {
      await expect(createDevice().onUninit()).resolves.toBeUndefined()
    })
  })

  describe('adding capabilities', () => {
    it('should add a capability when it is absent', async () => {
      const device = createDevice()
      vi.spyOn(device, 'hasCapability').mockReturnValue(false)
      await device.addCapability('measure_power')

      expect(superAddCapabilityMock).toHaveBeenCalledWith('measure_power')
    })

    it('should not add a capability when it is present', async () => {
      const device = createDevice()
      vi.spyOn(device, 'hasCapability').mockReturnValue(true)
      await device.addCapability('measure_power')

      expect(superAddCapabilityMock).not.toHaveBeenCalled()
    })
  })

  describe('removing capabilities', () => {
    it('should remove a capability when it is present', async () => {
      const device = createDevice()
      vi.spyOn(device, 'hasCapability').mockReturnValue(true)
      await device.removeCapability('measure_power')

      expect(superRemoveCapabilityMock).toHaveBeenCalledWith('measure_power')
    })

    it('should not remove a capability when it is absent', async () => {
      const device = createDevice()
      vi.spyOn(device, 'hasCapability').mockReturnValue(false)
      await device.removeCapability('measure_power')

      expect(superRemoveCapabilityMock).not.toHaveBeenCalled()
    })
  })

  describe('warning management', () => {
    it('should show then clear the warning for a non-null error', async () => {
      await createDevice().setWarning(new Error('boom'))

      expect(superSetWarningMock).toHaveBeenNthCalledWith(1, 'boom')
      expect(superSetWarningMock).toHaveBeenNthCalledWith(2, null)
      expect(superSetWarningMock).toHaveBeenCalledTimes(2)
    })

    it('should only clear the warning for null', async () => {
      await createDevice().setWarning(null)

      expect(superSetWarningMock).toHaveBeenCalledTimes(1)
      expect(superSetWarningMock).toHaveBeenCalledWith(null)
    })
  })

  describe('name-prefixed logging', () => {
    it('should prefix errors with the device name', () => {
      createDevice().error('boom', 42)

      expect(superErrorMock).toHaveBeenCalledWith(
        'Test device',
        '-',
        'boom',
        42,
      )
    })

    it('should prefix logs with the device name', () => {
      createDevice().log('hello')

      expect(superLogMock).toHaveBeenCalledWith('Test device', '-', 'hello')
    })
  })
})
