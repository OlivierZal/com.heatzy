import { Device } from 'homey' // eslint-disable-line import/no-extraneous-dependencies
import { DateTime, Duration } from 'luxon'
import type HeatzyDriver from './driver'
import addToLogs from '../../decorators/addToLogs'
import withAPI from '../../mixins/withAPI'
import {
  DerogMode,
  Mode,
  ModeZh,
  type BaseAttrs,
  type CapabilityValue,
  type Data,
  type DeviceData,
  type DeviceDetails,
  type DevicePostDataAny,
  type ModeString,
  type OnMode,
  type PreviousMode,
  type Settings,
  type Switch,
} from '../../types'
import { isFirstGen, isFirstPilot } from '../../utils'

const DEROG_MODE_CAP_OFF = String(DerogMode.off)

const booleanToSwitch = (value: boolean): Switch => Number(value) as Switch

@addToLogs('getName()')
class HeatzyDevice extends withAPI(Device) {
  public declare driver: HeatzyDriver

  #attrs: BaseAttrs = {}

  #id!: string

  #productKey!: string

  #productName!: string

  #mode!: 'mode_3' | 'mode'

  #onMode!: OnMode

  #syncTimeout!: NodeJS.Timeout

  private get onMode(): OnMode {
    return this.#onMode
  }

  private set onMode(value: PreviousMode) {
    this.#onMode =
      value === 'previous'
        ? (this.getStoreValue('previousMode') as OnMode)
        : value
  }

  public async onInit(): Promise<void> {
    await this.setWarning(null)

    const { id, productKey, productName } =
      this.getData() as DeviceDetails['data']
    this.#id = id
    this.#productKey = productKey
    this.#productName = productName
    await this.handleCapabilities()
    if (this.getStoreValue('previousMode') === null) {
      await this.setStoreValue('previousMode', 'eco')
    }

    this.#mode = isFirstPilot(this.#productName) ? 'mode' : 'mode_3'
    this.onMode = this.getSetting('on_mode') ?? 'previous'
    this.registerCapabilityListeners()
    await this.syncFromDevice()
  }

  public async onSettings({
    newSettings,
    changedKeys,
  }: {
    newSettings: Settings
    changedKeys: string[]
  }): Promise<void> {
    if (changedKeys.includes('on_mode') && newSettings.on_mode) {
      this.onMode = newSettings.on_mode
    }
    if (
      changedKeys.includes('always_on') &&
      newSettings.always_on === true &&
      !(this.getCapabilityValue('onoff') as boolean)
    ) {
      await this.triggerCapabilityListener('onoff', true)
    }
  }

  public onDeleted(): void {
    this.clearSync()
  }

  public async addCapability(capability: string): Promise<void> {
    if (this.hasCapability(capability)) {
      return
    }
    try {
      await super.addCapability(capability)
      this.log('Adding capability', capability)
    } catch (error: unknown) {
      this.error(error instanceof Error ? error.message : error)
    }
  }

  public async removeCapability(capability: string): Promise<void> {
    if (!this.hasCapability(capability)) {
      return
    }
    try {
      await super.removeCapability(capability)
      this.log('Removing capability', capability)
    } catch (error: unknown) {
      this.error(error instanceof Error ? error.message : error)
    }
  }

  public async setCapabilityValue(
    capability: string,
    value: CapabilityValue,
  ): Promise<void> {
    if (
      !this.hasCapability(capability) ||
      value === this.getCapabilityValue(capability)
    ) {
      return
    }
    try {
      await super.setCapabilityValue(capability, value)
      this.log('Capability', capability, 'is', value)
    } catch (error: unknown) {
      this.error(error instanceof Error ? error.message : error)
    }
  }

  public getSetting<K extends keyof Settings>(setting: K): Settings[K] {
    return super.getSetting(setting) as Settings[K]
  }

  public async setWarning(warning: string | null): Promise<void> {
    if (warning !== null) {
      await super.setWarning(warning)
    }
    await super.setWarning(null)
  }

  private async onCapability(
    capability: string,
    value: CapabilityValue,
  ): Promise<void> {
    this.clearSync()
    let mode: keyof typeof Mode | null = null
    switch (capability) {
      case 'onoff':
      case this.#mode:
        mode = await this.getMode(capability, value)
        if (mode) {
          this.#attrs.mode = Mode[mode]
        }
        break
      case 'derog_time_boost':
        this.#attrs.derog_mode = Number(value) ? DerogMode.boost : DerogMode.off
        this.#attrs.derog_time = Number(value)
        break
      case 'derog_time_vacation':
        this.#attrs.derog_mode = Number(value)
          ? DerogMode.vacation
          : DerogMode.off
        this.#attrs.derog_time = Number(value)
        break
      case 'locked':
        this.#attrs.lock_switch = booleanToSwitch(value as boolean)
        break
      case 'onoff.timer':
        this.#attrs.timer_switch = booleanToSwitch(value as boolean)
        break
      case 'target_temperature':
        this.#attrs.cft_tempL = (value as number) * 10
        break
      case 'target_temperature.complement':
        this.#attrs.cft_tempH = (value as number) / 10
        break
      default:
    }
    this.applySyncToDevice()
  }

  private async handleCapabilities(): Promise<void> {
    const requiredCapabilities: string[] = this.driver.getRequiredCapabilities(
      this.#productKey,
      this.#productName,
    )
    await requiredCapabilities.reduce<Promise<void>>(
      async (acc, capability: string) => {
        await acc
        return this.addCapability(capability)
      },
      Promise.resolve(),
    )
    await this.getCapabilities()
      .filter(
        (capability: string) => !requiredCapabilities.includes(capability),
      )
      .reduce<Promise<void>>(async (acc, capability: string) => {
        await acc
        await this.removeCapability(capability)
      }, Promise.resolve())
  }

  private registerCapabilityListeners(): void {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    ;(this.driver.manifest.capabilities as string[]).forEach(
      (capability: string): void => {
        this.registerCapabilityListener(
          capability,
          async (value: CapabilityValue): Promise<void> => {
            await this.onCapability(capability, value)
          },
        )
      },
    )
  }

  private async syncFromDevice(): Promise<void> {
    await this.updateCapabilities()
    this.applySyncFromDevice()
  }

  private async getDeviceData(): Promise<DeviceData['attr'] | null> {
    try {
      const { data } = await this.api.get<DeviceData>(
        `/devdata/${this.#id}/latest`,
      )
      return data.attr
    } catch (error: unknown) {
      return null
    }
  }

  private async updateCapabilities(control = false): Promise<void> {
    let attr: BaseAttrs | DeviceData['attr'] | null = null
    if (control) {
      attr = this.#attrs
      this.#attrs = {}
    } else {
      attr = await this.getDeviceData()
    }
    if (!attr) {
      return
    }

    const {
      mode,
      derog_mode: derogMode,
      derog_time: derogTime,
      lock_switch: lockSwitch,
      timer_switch: timerSwitch,
    } = attr
    await this.updateMode(mode, control)
    await this.updateDerog(derogMode, derogTime, control)
    if (lockSwitch !== undefined) {
      await this.setCapabilityValue('locked', Boolean(lockSwitch))
    }
    if (timerSwitch !== undefined) {
      await this.setCapabilityValue('onoff.timer', Boolean(timerSwitch))
    }
  }

  private async updateMode(
    mode: Mode | ModeString | undefined,
    control: boolean,
  ): Promise<void> {
    if (mode === undefined) {
      return
    }
    let newMode: keyof typeof Mode | null = null
    switch (true) {
      case control:
        newMode = Mode[mode as Mode] as keyof typeof Mode
        break
      case mode in Mode:
        newMode = mode as keyof typeof Mode
        break
      case mode in ModeZh:
        newMode = Mode[ModeZh[mode as keyof typeof ModeZh]] as keyof typeof Mode
        break
      default:
        throw new Error(`Unknown mode: ${mode}`)
    }
    await this.setCapabilityValue(this.#mode, newMode)
    const isOn: boolean = Mode[newMode] !== Mode.stop
    await this.setCapabilityValue('onoff', isOn)
    if (isOn) {
      await this.setStoreValue('previousMode', newMode)
    }
  }

  private async updateDerog(
    derogMode: DerogMode | undefined,
    derogTime: number | undefined,
    control: boolean,
  ): Promise<void> {
    if (derogMode === undefined || derogTime === undefined) {
      return
    }
    let currentDerogMode: DerogMode = DerogMode.off
    if (this.getCapabilityValue('derog_time_vacation') !== DEROG_MODE_CAP_OFF) {
      currentDerogMode = DerogMode.vacation
    } else if (
      this.getCapabilityValue('derog_time_boost') !== DEROG_MODE_CAP_OFF
    ) {
      currentDerogMode = DerogMode.boost
    }
    const currentDerogTime = Number(
      this.getCapabilityValue(
        Number(this.getCapabilityValue('derog_time_vacation'))
          ? 'derog_time_vacation'
          : 'derog_time_boost',
      ),
    )
    if (
      control ||
      derogMode !== currentDerogMode ||
      derogTime !== currentDerogTime
    ) {
      let derogEnd: string | null = null
      const now: DateTime = DateTime.now()
      if (derogMode === DerogMode.vacation) {
        derogEnd = now.plus({ days: derogTime }).toLocaleString({
          day: 'numeric',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        })
      } else if (derogMode === DerogMode.boost) {
        derogEnd = now
          .plus({ minutes: derogTime })
          .toLocaleString(DateTime.TIME_24_SIMPLE)
      }
      await this.setCapabilityValue('derog_end', derogEnd)
    }
    const time = String(derogTime)
    switch (derogMode) {
      case DerogMode.off:
        await this.setCapabilityValue('derog_time_vacation', DEROG_MODE_CAP_OFF)
        await this.setCapabilityValue('derog_time_boost', DEROG_MODE_CAP_OFF)
        break
      case DerogMode.vacation:
        await this.setCapabilityValue('derog_time_vacation', time)
        await this.setDisplayErrorWarning('derog_time_boost')
        break
      case DerogMode.boost:
        await this.setCapabilityValue('derog_time_boost', time)
        await this.setDisplayErrorWarning('derog_time_vacation')
        break
      default:
    }
  }

  private applySyncFromDevice(): void {
    this.#syncTimeout = this.homey.setTimeout(
      async (): Promise<void> => {
        await this.syncFromDevice()
      },
      Duration.fromObject({ minutes: 1 }).as('milliseconds'),
    )
  }

  private clearSync(): void {
    this.homey.clearTimeout(this.#syncTimeout)
  }

  private async getMode(
    capability: 'mode_3' | 'mode' | 'onoff',
    value: CapabilityValue,
  ): Promise<keyof typeof Mode | null> {
    let mode: keyof typeof Mode | null = null
    if (capability === 'onoff') {
      mode = (value as boolean)
        ? this.onMode
        : (Mode[Mode.stop] as keyof typeof Mode)
    } else {
      mode = value as keyof typeof Mode
    }
    if (Mode[mode] === Mode.stop && this.getSetting('always_on') === true) {
      mode = null
      await this.setWarning(this.homey.__('warnings.always_on'))
      this.homey.setTimeout(
        async (): Promise<void> =>
          this.setCapabilityValue(
            capability,
            capability === this.#mode
              ? (this.getStoreValue('previousMode') as OnMode)
              : true,
          ),
        Duration.fromObject({ seconds: 1 }).as('milliseconds'),
      )
    }
    return mode
  }

  private applySyncToDevice(): void {
    this.#syncTimeout = this.homey.setTimeout(
      async (): Promise<void> => {
        await this.syncToDevice()
      },
      Duration.fromObject({ seconds: 1 }).as('milliseconds'),
    )
  }

  private async syncToDevice(): Promise<void> {
    const postData: DevicePostDataAny | null = this.buildPostData()
    await this.control(postData)
  }

  private buildPostData(): DevicePostDataAny | null {
    if (!Object.keys(this.#attrs).length) {
      return null
    }
    if (!isFirstGen(this.#productKey)) {
      return { attrs: this.#attrs }
    }
    if (this.#attrs.mode !== undefined) {
      return {
        raw: [1, 1, this.#attrs.mode],
      }
    }
    return null
  }

  private async control(
    postData: DevicePostDataAny | null,
  ): Promise<Data | null> {
    if (!postData) {
      return null
    }
    try {
      const { data } = await this.api.post<Data>(
        `/control/${this.#id}`,
        postData,
      )
      await this.updateCapabilities(true)
      return data
    } catch (error: unknown) {
      await this.syncFromDevice()
      return null
    }
  }

  private async setDisplayErrorWarning(capability: string): Promise<void> {
    if (this.getCapabilityValue(capability) !== DEROG_MODE_CAP_OFF) {
      await this.setCapabilityValue(capability, DEROG_MODE_CAP_OFF)
      await this.setWarning(this.homey.__('warnings.display_error'))
    }
  }
}

export = HeatzyDevice
