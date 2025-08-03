// eslint-disable-next-line import-x/no-extraneous-dependencies
import Homey from 'homey'

import {
  type IDeviceFacadeAny,
  type PostAttributes,
  DerogationMode,
  getTargetTemperature,
  Mode,
  Product,
  supportsGlow,
  supportsPro,
  supportsV2,
} from '@olivierzal/heatzy-api'

import { LENGTH_ZERO } from '../../constants.mts'
import { addToLogs } from '../../decorators/add-to-logs.mts'
import {
  type Capabilities,
  type CapabilitiesOptions,
  type DeviceDetails,
  type SetCapabilities,
  type Settings,
  type Store,
  getCapabilitiesOptions,
  getRequiredCapabilities,
} from '../../types.mts'

import type HeatzyDriver from './driver.mts'

const DEBOUNCE_DELAY = 1000

const modes = new Set([
  Mode.comfort,
  Mode.comfortMinus1,
  Mode.comfortMinus2,
  Mode.eco,
  Mode.frostProtection,
  Mode.stop,
]) as Set<string>

const isMode = (value: boolean | number | string): value is Mode =>
  typeof value === 'string' && modes.has(value)

const iskeyOfDerogationMode = (
  value: boolean | number | string,
): value is keyof typeof DerogationMode =>
  typeof value === 'string' && value in DerogationMode

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

@addToLogs('getName()')
// eslint-disable-next-line import-x/no-named-as-default-member
export default class HeatzyDevice extends Homey.Device {
  declare public readonly driver: HeatzyDriver

  declare public readonly getCapabilities: () => (keyof Capabilities)[]

  declare public readonly getCapabilityOptions: <
    K extends keyof CapabilitiesOptions,
  >(
    capability: K,
  ) => CapabilitiesOptions[K]

  declare public readonly getCapabilityValue: <K extends keyof Capabilities>(
    capability: K,
  ) => Capabilities[K]

  declare public readonly getData: () => DeviceDetails['data']

  declare public readonly getSetting: <K extends keyof Settings>(
    setting: K,
  ) => NonNullable<Settings[K]>

  declare public readonly getSettings: () => Settings

  declare public readonly getStoreValue: <K extends keyof Store>(
    key: K,
  ) => Store[K]

  declare public readonly homey: Homey.Homey

  declare public readonly registerMultipleCapabilityListener: (
    capabilityIds: (keyof SetCapabilities)[],
    listener: Homey.Device.MultipleCapabilityCallback,
    timeout?: number,
  ) => void

  declare public readonly setCapabilityOptions: <
    K extends keyof CapabilitiesOptions,
  >(
    capability: K,
    options: CapabilitiesOptions[K] & Record<string, unknown>,
  ) => Promise<void>

  declare public readonly setCapabilityValue: <K extends keyof Capabilities>(
    capability: K,
    value: Capabilities[K],
  ) => Promise<void>

  declare public readonly setSettings: (settings: Settings) => Promise<void>

  declare public readonly setStoreValue: <K extends keyof Store>(
    key: K,
    value: Store[K],
  ) => Promise<void>

  declare public readonly triggerCapabilityListener: <
    K extends keyof Capabilities,
  >(
    capability: K,
    value: Capabilities[K],
  ) => Promise<void>

  readonly #toDevice: Record<
    keyof SetCapabilities,
    (
      value: SetCapabilities[keyof SetCapabilities],
      product: Product,
    ) => PostAttributes
  > = {
    derog_time: (value: SetCapabilities[keyof SetCapabilities]) => ({
      derog_time: Number(value),
    }),
    heater_operation_mode: (value: SetCapabilities[keyof SetCapabilities]) =>
      iskeyOfDerogationMode(value) ? { derog_mode: DerogationMode[value] } : {},
    locked: (
      value: SetCapabilities[keyof SetCapabilities],
      product: Product,
    ) => ({
      [product === Product.glow ? 'lock_c' : 'lock_switch']: Number(value),
    }),
    onoff: (value: SetCapabilities[keyof SetCapabilities], product: Product) =>
      product === Product.glow ?
        { on_off: Number(value) }
      : { mode: value === true ? this.#onValue : this.#offValue },
    'onoff.timer': (value: SetCapabilities[keyof SetCapabilities]) => ({
      timer_switch: Number(value),
    }),
    'onoff.window_detection': (
      value: SetCapabilities[keyof SetCapabilities],
    ) => ({ window_switch: Number(value) }),
    target_temperature: (
      value: SetCapabilities[keyof SetCapabilities],
      product: Product,
    ) => getTargetTemperature(product, Mode.comfort, Number(value)),
    'target_temperature.eco': (
      value: SetCapabilities[keyof SetCapabilities],
      product: Product,
    ) => getTargetTemperature(product, Mode.eco, Number(value)),
    thermostat_mode: (value: SetCapabilities[keyof SetCapabilities]) =>
      isMode(value) ?
        { mode: value === Mode.stop ? this.#offValue : value }
      : {},
  }

  #device?: IDeviceFacadeAny

  public get id(): string {
    return this.getData().id
  }

  get #offValue(): Mode {
    return this.getSetting('always_on') ? this.#onValue : Mode.stop
  }

  get #onValue(): Mode {
    const onMode = this.getSetting('on_mode')
    return (
      (onMode === 'previous' ? this.getStoreValue('previousMode') : onMode) ??
      Mode.eco
    )
  }

  public override async onInit(): Promise<void> {
    await this.setWarning(null)
    this.#registerCapabilityListeners()
    await this.#fetchDevice()
  }

  public override async onSettings({
    changedKeys,
    newSettings,
  }: {
    changedKeys: string[]
    newSettings: Settings
  }): Promise<void> {
    if (changedKeys.includes('always_on') && newSettings.always_on === true) {
      await this.triggerCapabilityListener('onoff', true)
    }
  }

  public override async addCapability(capability: string): Promise<void> {
    if (!this.hasCapability(capability)) {
      await super.addCapability(capability)
    }
  }

  public override async removeCapability(capability: string): Promise<void> {
    if (this.hasCapability(capability)) {
      await super.removeCapability(capability)
    }
  }

  public override async setWarning(error: unknown): Promise<void> {
    if (error !== null) {
      await super.setWarning(getErrorMessage(error))
    }
    await super.setWarning(null)
  }

  public async syncFromDevice(device?: IDeviceFacadeAny): Promise<void> {
    try {
      const newDevice = device ?? (await this.#fetchDevice())
      if (newDevice) {
        await this.#setV1CapabilityValues(newDevice)
        await this.#setV2CapabilityValues(newDevice)
        await this.#setGlowCapabilityValues(newDevice)
        await this.#setProCapabilityValues(newDevice)
        await this.setStoreValue('previousMode', newDevice.previousMode)
      }
    } catch {
      await this.setWarning(
        this.homey.__(this.homey.__('errors.deviceNotFound')),
      )
    }
  }

  #buildUpdateData(
    device: IDeviceFacadeAny,
    values: Partial<SetCapabilities>,
  ): PostAttributes {
    this.log('Requested data:', values)
    return Object.fromEntries(
      Object.entries(values).flatMap(([capability, value]) =>
        Object.entries(
          this.#convertToDevice(
            device.product,
            // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
            capability as keyof SetCapabilities,
            value,
          ),
        ),
      ),
    )
  }

  #convertToDevice<K extends keyof SetCapabilities>(
    product: Product,
    capability: K,
    value: SetCapabilities[K],
  ): PostAttributes {
    return this.#toDevice[capability](value, product)
  }

  async #fetchDevice(): Promise<IDeviceFacadeAny | null> {
    try {
      if (!this.#device) {
        this.#device = this.homey.app.getFacade(this.id)
        await this.#init(this.#device)
      }
      return this.#device
    } catch (error) {
      await this.setWarning(error)
      return null
    }
  }

  async #init(device: IDeviceFacadeAny): Promise<void> {
    const { product } = device
    await this.#setCapabilities(product)
    await this.#setCapabilityOptions(product)
    await this.syncFromDevice(device)
  }

  #registerCapabilityListeners(): void {
    this.registerMultipleCapabilityListener(
      [
        'heater_operation_mode',
        'derog_time',
        'locked',
        'onoff',
        'onoff.timer',
        'onoff.window_detection',
        'target_temperature',
        'target_temperature.eco',
        'thermostat_mode',
      ],
      async (values) => this.#set(values),
      DEBOUNCE_DELAY,
    )
  }

  async #set(values: Partial<SetCapabilities>): Promise<void> {
    const device = await this.#fetchDevice()
    if (device) {
      const updateData = this.#buildUpdateData(device, values)
      if (Object.keys(updateData).length > LENGTH_ZERO) {
        try {
          await device.setValues(updateData)
        } catch (error) {
          await this.setWarning(error)
        }
      }
    }
  }

  async #setCapabilities(product: Product): Promise<void> {
    const currentCapabilities = new Set(this.getCapabilities())
    const requiredCapabilities = new Set(getRequiredCapabilities(product))
    for (const capability of currentCapabilities.symmetricDifference(
      requiredCapabilities,
    )) {
      // eslint-disable-next-line no-await-in-loop
      await (requiredCapabilities.has(capability) ?
        this.addCapability(capability)
      : this.removeCapability(capability))
    }
  }

  async #setCapabilityOptions(product: Product): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    for (const [capability, options] of Object.entries(
      getCapabilitiesOptions(product),
    ) as [
      keyof CapabilitiesOptions,
      CapabilitiesOptions[keyof CapabilitiesOptions],
    ][]) {
      // eslint-disable-next-line no-await-in-loop
      await this.setCapabilityOptions(capability, options)
    }
  }

  async #setGlowCapabilityValues(device: IDeviceFacadeAny): Promise<void> {
    if (supportsGlow(device)) {
      const { comfortTemperature, currentTemperature, ecoTemperature } = device
      await this.setCapabilityValue('measure_temperature', currentTemperature)
      await this.setCapabilityValue('target_temperature', comfortTemperature)
      await this.setCapabilityValue('target_temperature.eco', ecoTemperature)
    }
  }

  async #setProCapabilityValues(device: IDeviceFacadeAny): Promise<void> {
    if (supportsPro(device)) {
      const {
        currentHumidity,
        currentMode,
        isDetectingOpenWindow,
        isPresence,
      } = device
      await this.setCapabilityValue('alarm_presence', isPresence)
      await this.setCapabilityValue('measure_humidity', currentHumidity)
      await this.setCapabilityValue(
        'onoff.window_detection',
        isDetectingOpenWindow,
      )
      await this.setCapabilityValue('operational_state', currentMode)
    }
  }

  async #setV1CapabilityValues(device: IDeviceFacadeAny): Promise<void> {
    const { isOn, mode } = device
    await this.setCapabilityValue('onoff', isOn)
    await this.setCapabilityValue('thermostat_mode', mode)
  }

  async #setV2CapabilityValues(device: IDeviceFacadeAny): Promise<void> {
    if (supportsV2(device)) {
      const {
        derogationEndString,
        derogationMode,
        derogationTime,
        isLocked,
        isTimer,
      } = device
      await this.setCapabilityValue('derog_end', derogationEndString)
      const { [derogationMode]: keyOfDerogationMode } = DerogationMode
      if (iskeyOfDerogationMode(keyOfDerogationMode)) {
        await this.setCapabilityValue(
          'heater_operation_mode',
          keyOfDerogationMode,
        )
      }
      await this.setCapabilityValue('derog_time', String(derogationTime))
      await this.setCapabilityValue('locked', isLocked)
      await this.setCapabilityValue('onoff.timer', isTimer)
    }
  }
}
