import {
  DerogMode,
  Mode,
  type Attrs,
  type DerogSettings,
  type IDeviceFacadeAny,
  type Switch,
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

const TEMPERATURE_SCALE_FACTOR = 10
const DEBOUNCE_DELAY = 1000

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

  get #offValue(): keyof typeof Mode {
    return this.getSetting('always_on') ? this.#onValue : 'stop'
  }

  get #onValue(): keyof typeof Mode {
    return (
      (this.getSetting('on_mode') === 'previous' ?
        this.getStoreValue('previousMode')
      : (this.getSetting('on_mode') as PreviousMode | undefined)) ?? 'eco'
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

  // eslint-disable-next-line max-statements
  public async syncFromDevice(): Promise<void> {
    try {
      const newDevice = await this.#fetchDevice()
      if (newDevice) {
        await this.setCapabilityValue('onoff', newDevice.isOn)
        await this.setCapabilityValue(
          'thermostat_mode',
          Mode[newDevice.mode] as keyof typeof Mode,
        )
        if ('lockSwitch' in newDevice) {
          await this.setCapabilityValue('locked', newDevice.lockSwitch)
        }
        if ('timerSwitch' in newDevice) {
          await this.setCapabilityValue('onoff.timer', newDevice.timerSwitch)
        }
        if ('comfortTemperature' in newDevice) {
          await this.setCapabilityValue(
            'target_temperature',
            newDevice.comfortTemperature,
          )
        }
        if ('ecoTemperature' in newDevice) {
          await this.setCapabilityValue(
            'target_temperature.eco',
            newDevice.ecoTemperature,
          )
        }
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
        Object.entries(values).map(([capability, value]) =>
          this.#convertToDevice(capability as keyof SetCapabilities, value),
        ),
      )
    ).reduce((acc, data) => ({ ...acc, ...data }), {})
  }

  #convertToDevice<K extends keyof SetCapabilities>(
    capability: K,
    value: SetCapabilities[K],
  ): Partial<Attrs> {
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
      case 'target_temperature':
        return { cft_tempL: (value as number) * TEMPERATURE_SCALE_FACTOR }
      case 'target_temperature.complement':
        return { cft_tempH: (value as number) / TEMPERATURE_SCALE_FACTOR }
      case 'thermostat_mode':
        return {
          mode:
            value === 'stop' ? this.#offValue : (value as keyof typeof Mode),
        }
      default:
        return {}
    }
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

  async #setCapabilities({
    isFirstGen,
    isGlow,
  }: {
    isFirstGen: boolean
    isGlow: boolean
  }): Promise<void> {
    const capabilities = this.driver.getRequiredCapabilities({
      isFirstGen,
      isGlow,
    })
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
}
