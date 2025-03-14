import {
  DerogationMode,
  getTargetTemperature,
  Mode,
  Product,
  supportsGlow,
  supportsPro,
  supportsV2,
  type IDeviceFacadeAny,
  type PostAttrs,
} from '@olivierzal/heatzy-api'
// eslint-disable-next-line import/default, import/no-extraneous-dependencies
import Homey from 'homey'

import { addToLogs } from '../../decorators/add-to-logs.mts'
import {
  getCapabilitiesOptions,
  getRequiredCapabilities,
  type Capabilities,
  type CapabilitiesOptions,
  type DeviceDetails,
  type SetCapabilities,
  type Settings,
  type Store,
} from '../../types.mts'

import type HeatzyDriver from './driver.mts'

const DEBOUNCE_DELAY = 1000

const isDerogationMode = (
  value: boolean | number | string,
): value is keyof typeof DerogationMode =>
  typeof value === 'string' && value in DerogationMode

const isMode = (value: boolean | number | string): value is Mode =>
  typeof value === 'string' && value in Mode

const getErrorMessage = (error: unknown): string | null => {
  if (error !== null) {
    if (error instanceof Error) {
      return error.message
    }
    if (typeof error === 'string') {
      return error
    }
  }
  return null
}

const getModeFromCapability = (
  capability: 'target_temperature' | 'target_temperature.eco',
): Mode.eco | Mode.cft =>
  capability === 'target_temperature.eco' ? Mode.eco : Mode.cft

@addToLogs('getName()')
// eslint-disable-next-line import/no-named-as-default-member
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
    const warning = getErrorMessage(error)
    if (warning !== null) {
      await super.setWarning(warning)
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

  async #buildUpdateData(
    device: IDeviceFacadeAny,
    values: Partial<SetCapabilities>,
  ): Promise<PostAttrs> {
    this.log('Requested data:', values)
    return (
      await Promise.all(
        Object.entries(values).map(([capability, value]) =>
          this.#convertToDevice(device.product, capability, value),
        ),
      )
    ).reduce((acc, data) => ({ ...acc, ...data }), {})
  }

  #convertToDevice(
    product: Product,
    capability: string,
    value: SetCapabilities[keyof SetCapabilities],
  ): PostAttrs {
    switch (capability) {
      case 'derog_time':
        return { derog_time: Number(value) }
      case 'heater_operation_mode':
        return isDerogationMode(value) ?
            { derog_mode: DerogationMode[value] }
          : {}
      case 'locked':
        return {
          [product === Product.glow ? 'lock_c' : 'lock_switch']: Number(value),
        }
      case 'onoff':
        return product === Product.glow ?
            { on_off: Number(value) }
          : { mode: value === true ? this.#onValue : this.#offValue }
      case 'onoff.timer':
        return { timer_switch: Number(value) }
      case 'onoff.window_detection':
        return { window_switch: Number(value) }
      case 'target_temperature':
      case 'target_temperature.eco':
        return getTargetTemperature(
          product,
          getModeFromCapability(capability),
          Number(value),
        )
      case 'thermostat_mode':
        return isMode(value) ?
            { mode: value === Mode.stop ? this.#offValue : value }
          : {}
      default:
    }
    return {}
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
      const updateData = await this.#buildUpdateData(device, values)
      if (Object.keys(updateData).length) {
        try {
          await device.setValues(updateData)
        } catch (error) {
          await this.setWarning(error)
        }
      }
    }
  }

  async #setCapabilities(product: Product): Promise<void> {
    const capabilities = getRequiredCapabilities(product)
    await capabilities.reduce(async (acc, capability) => {
      await acc
      return this.addCapability(capability)
    }, Promise.resolve())
    await this.getCapabilities()
      .filter((capability) => !capabilities.includes(capability))
      .reduce(async (acc, capability) => {
        await acc
        await this.removeCapability(capability)
      }, Promise.resolve())
  }

  async #setCapabilityOptions(product: Product): Promise<void> {
    await Object.entries(getCapabilitiesOptions(product)).reduce(
      async (acc, capabilityOptions) => {
        await acc
        await this.setCapabilityOptions(
          // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
          ...(capabilityOptions as [
            keyof CapabilitiesOptions,
            CapabilitiesOptions[keyof CapabilitiesOptions],
          ]),
        )
      },
      Promise.resolve(),
    )
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
      const { [derogationMode]: keyofDerogationMode } = DerogationMode
      await this.setCapabilityValue('derog_end', derogationEndString)
      if (isDerogationMode(keyofDerogationMode)) {
        await this.setCapabilityValue(
          'heater_operation_mode',
          keyofDerogationMode,
        )
      }
      await this.setCapabilityValue('derog_time', String(derogationTime))
      await this.setCapabilityValue('locked', isLocked)
      await this.setCapabilityValue('onoff.timer', isTimer)
    }
  }
}
