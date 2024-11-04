import {
  DerogMode,
  type Attrs,
  type BaseAttrs,
  type DerogSettings,
  type DeviceFacade,
  type Mode,
  type Switch,
} from '@olivierzal/heatzy-api'

import { Homey } from '../../homey.mjs'
import { addToLogs } from '../../lib/addToLogs.mjs'
import { getErrorMessage } from '../../lib/getErrorMessage.mjs'
import {
  getCapabilitiesOptions,
  type Capabilities,
  type CapabilitiesOptions,
  type DeviceDetails,
  type PreviousMode,
  type SetCapabilities,
  type Settings,
  type Store,
} from '../../types.mjs'

import type HeatzyApp from '../../app.mjs'

import type HeatzyDriver from './driver.mjs'

const TEMPERATURE_SCALE_FACTOR = 10
const DEBOUNCE_DELAY = 1000

@addToLogs('getName()')
export default class HeatzyDevice extends Homey.Device {
  public declare readonly driver: HeatzyDriver

  readonly #app = this.homey.app as HeatzyApp

  readonly #id = (this.getData() as DeviceDetails['data']).id

  #device?: DeviceFacade

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

  public override getCapabilityValue<K extends keyof Capabilities>(
    capability: K,
  ): Capabilities[K] {
    return super.getCapabilityValue(capability) as Capabilities[K]
  }

  public override getSetting<K extends string & keyof Settings>(
    setting: K,
  ): NonNullable<Settings[K]> {
    return super.getSetting(setting) as NonNullable<Settings[K]>
  }

  public override getStoreValue<K extends keyof Store>(key: K): Store[K] {
    return super.getStoreValue(key) as Store[K]
  }

  public override async removeCapability(capability: string): Promise<void> {
    if (this.hasCapability(capability)) {
      await super.removeCapability(capability)
    }
  }

  public override async setCapabilityOptions<
    K extends keyof CapabilitiesOptions,
  >(
    capability: K,
    options: CapabilitiesOptions[K] & Record<string, unknown>,
  ): Promise<void> {
    await super.setCapabilityOptions(capability, options)
  }

  public override async setCapabilityValue<K extends keyof Capabilities>(
    capability: K,
    value: Capabilities[K],
  ): Promise<void> {
    await super.setCapabilityValue(capability, value)
    this.log('Capability', capability, 'is', value)
  }

  public override async setStoreValue<K extends keyof Store>(
    key: K,
    value: Store[K],
  ): Promise<void> {
    await super.setStoreValue(key, value)
    this.log('Store', key, 'is', value)
  }

  public override async setWarning(error: unknown): Promise<void> {
    const warning = getErrorMessage(error)
    if (warning !== null) {
      await super.setWarning(warning)
    }
    await super.setWarning(null)
  }

  public async syncFromDevice(device?: DeviceFacade): Promise<void> {
    try {
      const newDevice = device ?? (await this.#fetchDevice())
      if (newDevice) {
        const {
          cftTempH,
          cftTempL,
          derogSettings,
          lockSwitch,
          mode,
          timerSwitch,
        } = newDevice
        await this.#setDerog(derogSettings)
        await this.#setTemperature({ tempH: cftTempH, tempL: cftTempL })
        await this.#setMode(mode)
        await this.#setLock(lockSwitch)
        await this.#setTimer(timerSwitch)
      }
    } catch {
      await this.setWarning(
        this.homey.__(this.homey.__('errors.deviceNotFound')),
      )
    }
  }

  async #buildUpdateData(values: Partial<SetCapabilities>): Promise<BaseAttrs> {
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

  async #fetchDevice(): Promise<DeviceFacade | undefined> {
    try {
      if (!this.#device) {
        this.#device = this.#app.getFacade(this.#id) as DeviceFacade | undefined
        if (this.#device) {
          await this.#init(this.#device)
        }
      }
      return this.#device
    } catch (error) {
      await this.setWarning(error)
    }
  }

  async #init(device: DeviceFacade): Promise<void> {
    await this.#setCapabilities(device)
    await this.#setCapabilityOptions(device.isFirstPilot)
    await this.syncFromDevice(device)
  }

  #registerCapabilityListeners(): void {
    this.registerMultipleCapabilityListener(
      this.driver.capabilities.filter(
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
          await device.set(updateData)
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

  async #setCapabilityOptions(isFirstPilot: boolean): Promise<void> {
    await this.setCapabilityOptions(
      'thermostat_mode',
      getCapabilitiesOptions(isFirstPilot).thermostat_mode,
    )
  }

  async #setDerog(derogSettings?: DerogSettings): Promise<void> {
    if (derogSettings !== undefined) {
      const { derogEnd, derogTimeBoost, derogTimeVacation } = derogSettings
      if (
        String(derogTimeBoost) !==
          this.getCapabilityValue('derog_time_boost') ||
        String(derogTimeVacation) !==
          this.getCapabilityValue('derog_time_vacation')
      ) {
        await this.setCapabilityValue('derog_end', derogEnd)
        await this.setCapabilityValue(
          'derog_time_boost',
          String(derogTimeBoost),
        )
        await this.setCapabilityValue(
          'derog_time_vacation',
          String(derogTimeVacation),
        )
      }
    }
  }

  async #setLock(value?: Switch): Promise<void> {
    if (value !== undefined) {
      await this.setCapabilityValue('locked', Boolean(value))
    }
  }

  async #setMode(mode: keyof typeof Mode): Promise<void> {
    const isOn = mode !== 'stop'
    await this.setCapabilityValue('thermostat_mode', mode)
    await this.setCapabilityValue('onoff', isOn)
    if (isOn) {
      await this.setStoreValue('previousMode', mode)
    }
  }

  async #setTemperature({
    tempH,
    tempL,
  }: {
    tempH?: number
    tempL?: number
  }): Promise<void> {
    if (tempH !== undefined) {
      await this.setCapabilityValue(
        'target_temperature',
        tempH * TEMPERATURE_SCALE_FACTOR,
      )
    }
    if (tempL !== undefined) {
      await this.setCapabilityValue(
        'target_temperature',
        tempL / TEMPERATURE_SCALE_FACTOR,
      )
    }
  }

  async #setTimer(value?: Switch): Promise<void> {
    if (value !== undefined) {
      await this.setCapabilityValue('onoff.timer', Boolean(value))
    }
  }
}
