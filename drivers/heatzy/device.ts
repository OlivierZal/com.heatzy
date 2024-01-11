import { Device } from 'homey' // eslint-disable-line import/no-extraneous-dependencies
import { DateTime, Duration } from 'luxon'
import type HeatzyDriver from './driver'
import addToLogs from '../../decorators/addToLogs'
import withAPI from '../../mixins/withAPI'
import {
  DerogMode,
  Mode,
  type BaseAttrs,
  type Capabilities,
  type Data,
  type DeviceData,
  type DeviceDetails,
  type DevicePostDataAny,
  type OnMode,
  type PreviousMode,
  type Settings,
  type Store,
  type Switch,
} from '../../types'
import { isFirstGen, isFirstPilot } from '../../utils'

const ON_MODE_PREVIOUS = 'previous'

const modeZh: Record<string, keyof typeof Mode> = {
  舒适: 'cft',
  经济: 'eco',
  解冻: 'fro',
  停止: 'stop',
}

const booleanToSwitch = (value: boolean): Switch => Number(value) as Switch

@addToLogs('getName()')
class HeatzyDevice extends withAPI(Device) {
  public declare driver: HeatzyDriver

  #attrs: BaseAttrs = {}

  readonly #data: DeviceDetails['data'] =
    this.getData() as DeviceDetails['data']

  readonly #id: string = this.#data.id

  readonly #productKey: string = this.#data.productKey

  readonly #productName: string = this.#data.productName

  readonly #isFirstGen: boolean = isFirstGen(this.#productKey)

  readonly #isFirstPilot: boolean = isFirstPilot(this.#productName)

  readonly #mode: 'mode_3' | 'mode' = this.#isFirstPilot ? 'mode' : 'mode_3'

  #syncTimeout!: NodeJS.Timeout

  #onMode!: OnMode

  private get onMode(): OnMode {
    return this.#onMode
  }

  private set onMode(value: PreviousMode) {
    this.#onMode =
      value === ON_MODE_PREVIOUS
        ? this.getStoreValue('previousMode') ?? (Mode[Mode.eco] as OnMode)
        : value
  }

  public async onInit(): Promise<void> {
    await this.setWarning(null)
    await this.handleCapabilities()
    if (!this.getStoreValue('previousMode')) {
      await this.setStoreValue('previousMode', Mode[Mode.eco] as OnMode)
    }
    this.onMode = this.getSetting('on_mode') ?? ON_MODE_PREVIOUS
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
      !this.getCapabilityValue('onoff')
    ) {
      await this.onCapability('onoff', true)
    }
  }

  public onDeleted(): void {
    this.clearSync()
  }

  public async addCapability(capability: string): Promise<void> {
    if (!this.hasCapability(capability)) {
      await super.addCapability(capability)
    }
  }

  public async removeCapability(capability: string): Promise<void> {
    if (this.hasCapability(capability)) {
      await super.removeCapability(capability)
    }
  }

  public getCapabilityValue<K extends keyof Capabilities>(
    capability: K,
  ): Capabilities[K] {
    return super.getCapabilityValue(capability) as Capabilities[K]
  }

  public async setCapabilityValue<K extends keyof Capabilities>(
    capability: K,
    value: Capabilities[K],
  ): Promise<void> {
    if (value !== this.getCapabilityValue(capability)) {
      await super.setCapabilityValue(capability, value)
      this.log('Capability', capability, 'is', value)
    }
  }

  public getSetting<K extends keyof Settings>(setting: K): Settings[K] {
    return super.getSetting(setting) as Settings[K]
  }

  public getStoreValue<K extends keyof Store>(key: K): Store[K] {
    return super.getStoreValue(key) as Store[K]
  }

  public async setStoreValue<K extends keyof Store>(
    key: K,
    value: Store[K],
  ): Promise<void> {
    if (value !== this.getStoreValue(key)) {
      await super.setStoreValue(key, value)
      this.log('Store', key, 'is', value)
    }
  }

  public async setWarning(warning: string | null): Promise<void> {
    if (warning !== null) {
      await super.setWarning(warning)
    }
    await super.setWarning(null)
  }

  public async onCapability<K extends keyof Capabilities>(
    capability: K,
    value: Capabilities[K],
  ): Promise<void> {
    this.clearSync()
    let mode: keyof typeof Mode | null = null
    switch (capability) {
      case 'onoff':
      case this.#mode:
        mode = await this.getMode(
          capability,
          value as boolean | keyof typeof Mode,
        )
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

  private registerCapabilityListeners<K extends keyof Capabilities>(): void {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    ;(this.driver.manifest.capabilities as K[]).forEach(
      (capability: K): void => {
        this.registerCapabilityListener(
          capability,
          async (value: Capabilities[K]): Promise<void> => {
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
    await this.updateMode(mode)
    await this.updateDerog(derogMode, derogTime, control)
    if (lockSwitch !== undefined) {
      await this.setCapabilityValue('locked', Boolean(lockSwitch))
    }
    if (timerSwitch !== undefined) {
      await this.setCapabilityValue('onoff.timer', Boolean(timerSwitch))
    }
  }

  private async updateMode(mode: Mode | string | undefined): Promise<void> {
    if (mode === undefined) {
      return
    }
    let newMode: string = typeof mode === 'number' ? Mode[mode] : mode
    if (newMode in modeZh) {
      newMode = modeZh[mode]
    }
    await this.setCapabilityValue(this.#mode, newMode as keyof typeof Mode)
    const isOn: boolean = Mode[newMode as keyof typeof Mode] !== Mode.stop
    await this.setCapabilityValue('onoff', isOn)
    if (isOn) {
      await this.setStoreValue('previousMode', newMode as OnMode)
    }
  }

  private async updateDerog(
    derogMode: DerogMode | undefined,
    derogTime: number | undefined,
    control = false,
  ): Promise<void> {
    if (derogMode === undefined || derogTime === undefined) {
      return
    }
    const vacationValue = Number(this.getCapabilityValue('derog_time_vacation'))
    const boostValue = Number(this.getCapabilityValue('derog_time_boost'))
    let currentDerogMode: DerogMode = DerogMode.off
    let currentDerogTime = 0
    if (vacationValue) {
      currentDerogMode = DerogMode.vacation
      currentDerogTime = vacationValue
    } else if (boostValue) {
      currentDerogMode = DerogMode.boost
      currentDerogTime = boostValue
    }
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
        await this.setCapabilityValue('derog_time_vacation', '0')
        await this.setCapabilityValue('derog_time_boost', '0')
        break
      case DerogMode.vacation:
        await this.setCapabilityValue('derog_time_vacation', time)
        await this.clearDerogTime('derog_time_boost')
        break
      case DerogMode.boost:
        await this.setCapabilityValue('derog_time_boost', time)
        await this.clearDerogTime('derog_time_vacation')
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

  private async getMode<K extends 'mode_3' | 'mode' | 'onoff'>(
    capability: K,
    value: Capabilities[K],
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
        async (): Promise<void> => {
          if (capability === 'onoff') {
            await this.setCapabilityValue('onoff', true)
          } else {
            await this.setCapabilityValue(
              this.#mode,
              this.getStoreValue('previousMode') ?? (Mode[Mode.eco] as OnMode),
            )
          }
        },
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
    if (!this.#isFirstGen) {
      return { attrs: this.#attrs }
    }
    if (this.#attrs.mode !== undefined) {
      return { raw: [1, 1, this.#attrs.mode] }
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

  private async clearDerogTime(
    capability: 'derog_time_boost' | 'derog_time_vacation',
  ): Promise<void> {
    if (Number(this.getCapabilityValue(capability))) {
      await this.setCapabilityValue(capability, '0')
      await this.setWarning(this.homey.__('warnings.display_error'))
    }
  }
}

export = HeatzyDevice
