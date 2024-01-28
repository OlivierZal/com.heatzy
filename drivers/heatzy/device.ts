import {
  type BaseAttrs,
  type Capabilities,
  type Data,
  DerogMode,
  type DeviceData,
  type DeviceDetails,
  type DevicePostDataAny,
  Mode,
  type ModeCapability,
  OnModeSetting,
  PreviousModeValue,
  type Settings,
  type Store,
  type Switch,
} from '../../types'
import { DateTime, Duration } from 'luxon'
import { isFirstGen, isFirstPilot } from '../../utils'
import { Device } from 'homey'
import type HeatzyDriver from './driver'
import addToLogs from '../../decorators/addToLogs'
import withAPI from '../../mixins/withAPI'

const MODE_ZH: Record<string, keyof typeof Mode> = {
  停止: 'stop',
  经济: 'eco',
  舒适: 'cft',
  解冻: 'fro',
}

const D_MULTIPLIER = 10

const booleanToSwitch = (value: boolean): Switch => Number(value) as Switch

const getVacationEnd = (days: number): string =>
  DateTime.now().plus({ days }).toLocaleString({
    day: 'numeric',
    hour: '2-digit',
    hour12: false,
    minute: '2-digit',
    month: 'short',
  })

const getBoostEnd = (minutes: number): string =>
  DateTime.now().plus({ minutes }).toLocaleString(DateTime.TIME_24_SIMPLE)

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

  readonly #mode: ModeCapability = this.#isFirstPilot ? 'mode' : 'mode3'

  #onModeValue!: PreviousModeValue

  #syncTimeout!: NodeJS.Timeout

  public async onInit(): Promise<void> {
    await this.setWarning(null)
    this.setOnModeValue(this.getSetting('on_mode'))
    await this.handleCapabilities()
    this.registerCapabilityListeners()
    await this.updateCapabilities()
  }

  public async onSettings({
    newSettings,
    changedKeys,
  }: {
    newSettings: Settings
    changedKeys: string[]
  }): Promise<void> {
    if (
      changedKeys.includes('on_mode') &&
      typeof newSettings.on_mode !== 'undefined'
    ) {
      this.setOnModeValue(newSettings.on_mode)
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

  public getSetting<K extends keyof Settings>(
    setting: K,
  ): NonNullable<Settings[K]> {
    return super.getSetting(setting) as NonNullable<Settings[K]>
  }

  public getStoreValue<K extends keyof Store>(key: K): NonNullable<Store[K]> {
    return (super.getStoreValue(key) as Store[K]) ?? PreviousModeValue.eco
  }

  public async setStoreValue<K extends keyof Store>(
    key: K,
    value: Store[K],
  ): Promise<void> {
    if (value !== super.getStoreValue(key)) {
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
      /* eslint-disable camelcase */
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
        this.#attrs.cft_tempL = (value as number) * D_MULTIPLIER
        break
      case 'target_temperature.complement':
        this.#attrs.cft_tempH = (value as number) / D_MULTIPLIER
        break
      /* eslint-enable camelcase */
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
    ;(this.driver.manifest.capabilities as K[]).forEach((capability: K) => {
      this.registerCapabilityListener(
        capability,
        async (value: Capabilities[K]): Promise<void> => {
          await this.onCapability(capability, value)
        },
      )
    })
  }

  private async getDeviceData(): Promise<DeviceData['attr'] | null> {
    try {
      return (await this.api.get<DeviceData>(`/devdata/${this.#id}/latest`))
        .data.attr
    } catch (error: unknown) {
      return null
    }
  }

  private async updateCapabilities(control = false): Promise<void> {
    const attr: BaseAttrs | DeviceData['attr'] | null = control
      ? this.#attrs
      : await this.getDeviceData()
    this.#attrs = {}
    if (attr) {
      await this.updateMode(attr.mode)
      await this.updateDerog(attr.derog_mode, attr.derog_time, control)
      if (typeof attr.lock_switch !== 'undefined') {
        await this.setCapabilityValue('locked', Boolean(attr.lock_switch))
      }
      if (typeof attr.timer_switch !== 'undefined') {
        await this.setCapabilityValue('onoff.timer', Boolean(attr.timer_switch))
      }
      this.applySyncFromDevice()
    }
  }

  private async updateMode(mode: Mode | string | undefined): Promise<void> {
    if (typeof mode === 'undefined') {
      return
    }
    let newMode: string = typeof mode === 'number' ? Mode[mode] : mode
    if (newMode in MODE_ZH) {
      newMode = MODE_ZH[mode]
    }
    await this.setCapabilityValue(this.#mode, newMode as keyof typeof Mode)
    const isOn: boolean = Mode[newMode as keyof typeof Mode] !== Mode.stop
    await this.setCapabilityValue('onoff', isOn)
    if (newMode in PreviousModeValue) {
      await this.setStoreValue('previousMode', newMode as PreviousModeValue)
    }
  }

  private async updateDerog(
    mode: DerogMode | undefined,
    time: number | undefined,
    control = false,
  ): Promise<void> {
    if (typeof mode !== 'undefined' && typeof time !== 'undefined') {
      let currentMode: DerogMode = DerogMode.off
      let currentTime = 0
      if (Number(this.getCapabilityValue('derog_time_vacation'))) {
        currentMode = DerogMode.vacation
        currentTime = Number(this.getCapabilityValue('derog_time_vacation'))
      } else if (Number(this.getCapabilityValue('derog_time_boost'))) {
        currentMode = DerogMode.boost
        currentTime = Number(this.getCapabilityValue('derog_time_boost'))
      }
      if (control || mode !== currentMode || time !== currentTime) {
        switch (mode) {
          case DerogMode.vacation:
            await this.setCapabilityValue('derog_end', getVacationEnd(time))
            await this.setCapabilityValue('derog_time_vacation', String(time))
            await this.clearDerogTime('derog_time_boost')
            break
          case DerogMode.boost:
            await this.setCapabilityValue('derog_end', getBoostEnd(time))
            await this.setCapabilityValue('derog_time_boost', String(time))
            await this.clearDerogTime('derog_time_vacation')
            break
          case DerogMode.off:
            await this.setCapabilityValue('derog_end', null)
            await this.setCapabilityValue('derog_time_vacation', '0')
            await this.setCapabilityValue('derog_time_boost', '0')
            break
          default:
        }
      }
    }
  }

  private applySyncFromDevice(): void {
    this.#syncTimeout = this.homey.setTimeout(
      async (): Promise<void> => {
        await this.updateCapabilities()
      },
      Duration.fromObject({ minutes: 1 }).as('milliseconds'),
    )
  }

  private clearSync(): void {
    this.homey.clearTimeout(this.#syncTimeout)
  }

  private async getMode<K extends ModeCapability | 'onoff'>(
    capability: K,
    value: Capabilities[K],
  ): Promise<keyof typeof Mode | null> {
    let mode: keyof typeof Mode | null = null
    if (capability === 'onoff') {
      mode = (value as boolean)
        ? this.#onModeValue
        : (Mode[Mode.stop] as keyof typeof Mode)
    } else {
      mode = value as keyof typeof Mode
    }
    if (Mode[mode] === Mode.stop && this.getSetting('always_on')) {
      mode = null
      await this.setWarning(this.homey.__('warnings.always_on'))
      this.homey.setTimeout(
        async (): Promise<void> => {
          if (capability === 'onoff') {
            await this.setCapabilityValue('onoff', true)
          } else {
            await this.setCapabilityValue(
              this.#mode,
              this.getStoreValue('previousMode'),
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
    if (typeof this.#attrs.mode !== 'undefined') {
      return { raw: [1, 1, this.#attrs.mode] }
    }
    return null
  }

  private async control(
    postData: DevicePostDataAny | null,
  ): Promise<Data | null> {
    let data: Data | null = null
    if (postData) {
      try {
        ;({ data } = await this.api.post<Data>(
          `/control/${this.#id}`,
          postData,
        ))
        await this.updateCapabilities(true)
      } catch (error: unknown) {
        await this.updateCapabilities()
      }
    }
    return data
  }

  private async clearDerogTime(
    capability: 'derog_time_boost' | 'derog_time_vacation',
  ): Promise<void> {
    if (Number(this.getCapabilityValue(capability))) {
      await this.setCapabilityValue(capability, '0')
      await this.setWarning(this.homey.__('warnings.display_error'))
    }
  }

  private setOnModeValue(value: OnModeSetting): void {
    this.#onModeValue =
      value === OnModeSetting.previous
        ? this.getStoreValue('previousMode')
        : PreviousModeValue[value]
  }
}

export = HeatzyDevice
