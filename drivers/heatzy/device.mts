import {
  DerogMode,
  Mode,
  supportsGlow,
  supportsPro,
  supportsV2,
  type Attrs,
  type IDeviceFacadeAny,
  type PostAttrs,
} from '@olivierzal/heatzy-api'
// eslint-disable-next-line import/default, import/no-extraneous-dependencies
import Homey from 'homey'

import { addToLogs } from '../../decorators/add-to-logs.mts'
import {
  getCapabilitiesOptions,
  type Capabilities,
  type CapabilitiesOptions,
  type DeviceDetails,
  type PreviousMode,
  type SetCapabilities,
  type Settings,
  type Store,
} from '../../types.mts'

import type HeatzyDriver from './driver.mts'

const DEBOUNCE_DELAY = 1000

const BYTE_MAX_VALUE = 255
const TEMPERATURE_SCALE = 10

const getTargetTemperature = (
  device: IDeviceFacadeAny,
  temperature: 'cft_temp' | 'eco_temp',
  value: number,
): PostAttrs => {
  if (supportsGlow(device)) {
    const tempH =
      Math.floor((value * TEMPERATURE_SCALE) / BYTE_MAX_VALUE) *
      TEMPERATURE_SCALE
    return {
      [`${temperature}H`]: tempH / TEMPERATURE_SCALE,
      [`${temperature}L`]: (value - tempH) * TEMPERATURE_SCALE,
    }
  }
  return { [temperature]: value }
}

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

@addToLogs('getName()')
// eslint-disable-next-line import/no-named-as-default-member
export default class HeatzyDevice extends Homey.Device {
  declare public readonly driver: HeatzyDriver

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

  declare public setStoreValue: <K extends keyof Store>(
    key: K,
    value: Store[K],
  ) => Promise<void>

  #device?: IDeviceFacadeAny

  public get id(): string {
    return this.getData().id
  }

  get #offValue(): Mode {
    return this.getSetting('always_on') ? this.#onValue : Mode.stop
  }

  get #onValue(): Mode {
    return (
      (this.getSetting('on_mode') === 'previous' ?
        this.getStoreValue('previousMode')
      : (this.getSetting('on_mode') as PreviousMode | undefined)) ?? Mode.eco
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

  public async syncFromDevice(): Promise<void> {
    try {
      const newDevice = await this.#fetchDevice()
      if (newDevice) {
        await this.#setV1CapabilityValues(newDevice)
        await this.#setV2CapabilityValues(newDevice)
        await this.#setGlowCapabilityValues(newDevice)
        await this.#setProCapabilityValues(newDevice)
      }
    } catch {
      await this.setWarning(
        this.homey.__(this.homey.__('errors.deviceNotFound')),
      )
    }
  }

  async #buildUpdateData(values: Partial<SetCapabilities>): Promise<Attrs> {
    this.log('Requested data:', values)
    return (
      await Promise.all(
        Object.entries(values).map(async ([capability, value]) =>
          this.#convertToDevice(capability as keyof SetCapabilities, value),
        ),
      )
    ).reduce((acc, data) => ({ ...acc, ...data }), {})
  }

  async #convertToDevice<K extends keyof SetCapabilities>(
    capability: K,
    value: SetCapabilities[K],
  ): Promise<PostAttrs> {
    try {
      const device = await this.#fetchDevice()
      if (device) {
        switch (capability) {
          case 'derog_time_boost':
            return {
              derog_mode: Number(value) ? DerogMode.boost : DerogMode.off,
              derog_time: Number(value),
            }
          case 'derog_time_vacation':
            return {
              derog_mode: Number(value) ? DerogMode.vacation : DerogMode.off,
              derog_time: Number(value),
            }
          case 'locked':
            return { lock_switch: Number(value) }
          case 'onoff':
            return { mode: (value as boolean) ? this.#onValue : this.#offValue }
          case 'onoff.timer':
            return { timer_switch: Number(value) }
          case 'onoff.window_detection':
            return { window_switch: Number(value) }
          case 'target_temperature':
            return getTargetTemperature(device, 'cft_temp', value as number)
          case 'target_temperature.eco':
            return getTargetTemperature(device, 'eco_temp', value as number)
          case 'thermostat_mode':
            return {
              mode:
                value === 'stop' ?
                  this.#offValue
                : Mode[value as keyof typeof Mode],
            }
          default:
        }
      }
    } catch {
      //
    }
    return {}
  }

  async #fetchDevice(): Promise<IDeviceFacadeAny | undefined> {
    try {
      if (!this.#device) {
        this.#device = this.homey.app.getFacade(this.id)
        await this.#init(this.#device)
      }
      return this.#device
    } catch (error) {
      await this.setWarning(error)
    }
  }

  async #init(device: IDeviceFacadeAny): Promise<void> {
    await this.#setCapabilities(device)
    await this.#setCapabilityOptions(device.doesNotSupportExtendedMode)
    await this.syncFromDevice()
  }

  #registerCapabilityListeners(): void {
    this.registerMultipleCapabilityListener(
      (this.driver.manifest.capabilities ?? []).filter(
        (capability) => !['derog_end', 'derog_mode'].includes(capability),
      ),
      async (values) => this.#set(values),
      DEBOUNCE_DELAY,
    )
  }

  async #set(values: Partial<SetCapabilities>): Promise<void> {
    const device = await this.#fetchDevice()
    if (device) {
      const updateData = await this.#buildUpdateData(values)
      if (Object.keys(updateData).length) {
        try {
          await device.setValues(updateData)
        } catch (error) {
          await this.setWarning(error)
        }
      }
    }
  }

  async #setCapabilities(device: IDeviceFacadeAny): Promise<void> {
    const capabilities = this.driver.getRequiredCapabilities(
      this.#device?.doesNotSupportExtendedMode,
    )
    await capabilities.reduce<Promise<void>>(async (acc, capability) => {
      await acc
      return this.addCapability(capability)
    }, Promise.resolve())
    await this.getCapabilities()
      .filter((capability) => !capabilities.includes(capability))
      .reduce<Promise<void>>(async (acc, capability) => {
        await acc
        await this.removeCapability(capability)
      }, Promise.resolve())
  }

  async #setCapabilityOptions(
    doesNotSupportExtendedMode: boolean,
  ): Promise<void> {
    await this.setCapabilityOptions(
      'thermostat_mode',
      getCapabilitiesOptions(doesNotSupportExtendedMode).thermostat_mode,
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
        currentSignal,
        isDetectingOpenWindow,
        isHeating,
      } = device
      await this.setCapabilityValue('alarm_heat', isHeating)
      await this.setCapabilityValue('measure_humidity', currentHumidity)
      await this.setCapabilityValue(
        'onoff.window_detection',
        isDetectingOpenWindow,
      )
      await this.setCapabilityValue(
        'operational_state',
        Mode[currentMode] as keyof typeof Mode,
      )
      await this.setCapabilityValue(
        'operational_state.signal',
        Mode[currentSignal] as keyof typeof Mode,
      )
    }
  }

  async #setV1CapabilityValues(device: IDeviceFacadeAny): Promise<void> {
    const { isOn, mode } = device
    await this.setCapabilityValue('onoff', isOn)
    await this.setCapabilityValue(
      'thermostat_mode',
      Mode[mode] as keyof typeof Mode,
    )
  }

  async #setV2CapabilityValues(device: IDeviceFacadeAny): Promise<void> {
    if (supportsV2(device)) {
      const { isLocked, isTimer } = device
      await this.setCapabilityValue('locked', isLocked)
      await this.setCapabilityValue('onoff.timer', isTimer)
    }
  }
}
