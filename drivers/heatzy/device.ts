import {
  type BaseAttrs,
  type Data,
  DerogMode,
  type DeviceData,
  type DevicePostDataAny,
  Mode,
  NUMBER_1,
} from '../../heatzy/types'
import {
  type Capabilities,
  type DeviceDetails,
  type ModeCapability,
  OnModeSetting,
  PreviousModeValue,
  type Settings,
  type Store,
} from '../../types'
import { DateTime, Duration } from 'luxon'
import { isFirstGen, isFirstPilot } from '../../utils'
import { Device } from 'homey'
import type HeatzyAPI from '../../heatzy/api'
import type HeatzyApp from '../../app'
import type HeatzyDriver from './driver'
import addToLogs from '../../decorators/addToLogs'

const MODE_ZH: Record<string, keyof typeof Mode> = {
  停止: 'stop',
  经济: 'eco',
  舒适: 'cft',
  解冻: 'fro',
}

const NUMBER_10 = 10

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
class HeatzyDevice extends Device {
  public declare readonly driver: HeatzyDriver

  #attrs: BaseAttrs = {}

  #onModeValue!: PreviousModeValue

  #syncTimeout!: NodeJS.Timeout

  readonly #data: DeviceDetails['data'] =
    this.getData() as DeviceDetails['data']

  readonly #heatzyAPI: HeatzyAPI = (this.homey.app as HeatzyApp).heatzyAPI

  readonly #id: string = this.#data.id

  readonly #isFirstGen: boolean = isFirstGen(this.#data.productKey)

  readonly #isFirstPilot: boolean = isFirstPilot(this.#data.productName)

  readonly #modeCapability: ModeCapability = this.#isFirstPilot
    ? 'mode'
    : 'mode3'

  readonly #productKey: string = this.#data.productKey

  readonly #productName: string = this.#data.productName

  public async addCapability(capability: string): Promise<void> {
    if (!this.hasCapability(capability)) {
      await super.addCapability(capability)
    }
  }

  public getCapabilityValue<K extends keyof Capabilities>(
    capability: K,
  ): Capabilities[K] {
    return super.getCapabilityValue(capability) as Capabilities[K]
  }

  public getSetting<K extends keyof Settings>(
    setting: K,
  ): NonNullable<Settings[K]> {
    return super.getSetting(setting) as NonNullable<Settings[K]>
  }

  public getStoreValue<K extends keyof Store>(key: K): NonNullable<Store[K]> {
    return (super.getStoreValue(key) as Store[K]) ?? PreviousModeValue.eco
  }

  public async onCapability<K extends keyof Capabilities>(
    capability: K,
    value: Capabilities[K],
  ): Promise<void> {
    let mode: keyof typeof Mode | null = null
    switch (capability) {
      case 'onoff':
      case this.#modeCapability:
        mode = await this.#getMode(
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
        this.#attrs.lock_switch = Number(value)
        break
      case 'onoff.timer':
        this.#attrs.timer_switch = Number(value)
        break
      case 'target_temperature':
        this.#attrs.cft_tempL = (value as number) * NUMBER_10
        break
      case 'target_temperature.complement':
        this.#attrs.cft_tempH = (value as number) / NUMBER_10
        break
      /* eslint-enable camelcase */
      default:
    }
  }

  public onDeleted(): void {
    this.homey.clearTimeout(this.#syncTimeout)
  }

  public async onInit(): Promise<void> {
    await this.setWarning(null)
    this.#setOnModeValue(this.getSetting('on_mode'))
    await this.#handleCapabilities()
    this.#registerCapabilityListeners()
    await this.#updateCapabilities()
  }

  public async onSettings({
    changedKeys,
    newSettings,
  }: {
    changedKeys: string[]
    newSettings: Settings
  }): Promise<void> {
    if (
      changedKeys.includes('on_mode') &&
      typeof newSettings.on_mode !== 'undefined'
    ) {
      this.#setOnModeValue(newSettings.on_mode)
    }
    if (
      changedKeys.includes('always_on') &&
      newSettings.always_on === true &&
      !this.getCapabilityValue('onoff')
    ) {
      await this.triggerCapabilityListener('onoff', true)
    }
  }

  public async onUninit(): Promise<void> {
    this.onDeleted()
    return Promise.resolve()
  }

  public async removeCapability(capability: string): Promise<void> {
    if (this.hasCapability(capability)) {
      await super.removeCapability(capability)
    }
  }

  public async setCapabilityValue<K extends keyof Capabilities>(
    capability: K,
    value: Capabilities[K],
  ): Promise<void> {
    this.log('Capability', capability, 'is', value)
    if (value !== this.getCapabilityValue(capability)) {
      await super.setCapabilityValue(capability, value)
    }
  }

  public async setStoreValue<K extends keyof Store>(
    key: K,
    value: Store[K],
  ): Promise<void> {
    this.log('Store', key, 'is', value)
    if (value !== super.getStoreValue(key)) {
      await super.setStoreValue(key, value)
    }
  }

  public async setWarning(warning: string | null): Promise<void> {
    if (warning !== null) {
      await super.setWarning(warning)
    }
    await super.setWarning(null)
  }

  #applySyncFromDevice(): void {
    this.#syncTimeout = this.homey.setTimeout(
      async (): Promise<void> => {
        await this.#updateCapabilities()
      },
      Duration.fromObject({ minutes: 1 }).as('milliseconds'),
    )
  }

  #applySyncToDevice(): void {
    this.#syncTimeout = this.homey.setTimeout(
      async (): Promise<void> => {
        await this.#syncToDevice()
      },
      Duration.fromObject({ seconds: 1 }).as('milliseconds'),
    )
  }

  #buildPostData(): DevicePostDataAny | null {
    if (!Object.keys(this.#attrs).length) {
      return null
    }
    if (!this.#isFirstGen) {
      return { attrs: this.#attrs }
    }
    if (typeof this.#attrs.mode !== 'undefined') {
      return { raw: [NUMBER_1, NUMBER_1, this.#attrs.mode] }
    }
    return null
  }

  async #control(postData: DevicePostDataAny | null): Promise<Data | null> {
    if (postData) {
      try {
        const { data } = await this.#heatzyAPI.control(this.#id, postData)
        await this.#updateCapabilities(true)
        return data
      } catch (error: unknown) {
        await this.#updateCapabilities()
      }
    }
    return null
  }

  async #getDeviceData(): Promise<DeviceData['attr'] | null> {
    try {
      return (await this.#heatzyAPI.deviceData(this.#id)).data.attr
    } catch (error: unknown) {
      return null
    }
  }

  async #getMode<K extends ModeCapability | 'onoff'>(
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
            return
          }
          await this.setCapabilityValue(
            this.#modeCapability,
            this.getStoreValue('previousMode'),
          )
        },
        Duration.fromObject({ seconds: 1 }).as('milliseconds'),
      )
    }
    return mode
  }

  async #handleCapabilities(): Promise<void> {
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

  #registerCapabilityListeners<K extends keyof Capabilities>(): void {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    ;(this.driver.manifest.capabilities as K[]).forEach((capability: K) => {
      this.registerCapabilityListener(
        capability,
        async (value: Capabilities[K]): Promise<void> => {
          this.homey.clearTimeout(this.#syncTimeout)
          await this.onCapability(capability, value)
          this.#applySyncToDevice()
        },
      )
    })
  }

  #setOnModeValue(value: OnModeSetting): void {
    this.#onModeValue =
      value === OnModeSetting.previous
        ? this.getStoreValue('previousMode')
        : PreviousModeValue[value]
  }

  async #syncToDevice(): Promise<void> {
    const postData: DevicePostDataAny | null = this.#buildPostData()
    await this.#control(postData)
  }

  async #updateCapabilities(control = false): Promise<void> {
    const attr: BaseAttrs | DeviceData['attr'] | null = control
      ? this.#attrs
      : await this.#getDeviceData()
    this.#attrs = {}
    if (attr) {
      await this.#updateMode(attr.mode)
      await this.#updateDerog(attr.derog_mode, attr.derog_time, control)
      if (typeof attr.lock_switch !== 'undefined') {
        await this.setCapabilityValue('locked', Boolean(attr.lock_switch))
      }
      if (typeof attr.timer_switch !== 'undefined') {
        await this.setCapabilityValue('onoff.timer', Boolean(attr.timer_switch))
      }
      this.#applySyncFromDevice()
    }
  }

  async #updateDerog(
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
            await this.setCapabilityValue('derog_time_boost', '0')
            break
          case DerogMode.boost:
            await this.setCapabilityValue('derog_end', getBoostEnd(time))
            await this.setCapabilityValue('derog_time_boost', String(time))
            await this.setCapabilityValue('derog_time_vacation', '0')
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

  async #updateMode(mode: Mode | string | undefined): Promise<void> {
    if (typeof mode !== 'undefined') {
      let newMode: string = typeof mode === 'number' ? Mode[mode] : mode
      if (newMode in MODE_ZH) {
        newMode = MODE_ZH[mode]
      }
      await this.setCapabilityValue(
        this.#modeCapability,
        newMode as keyof typeof Mode,
      )
      const isOn: boolean = Mode[newMode as keyof typeof Mode] !== Mode.stop
      await this.setCapabilityValue('onoff', isOn)
      if (newMode in PreviousModeValue) {
        await this.setStoreValue('previousMode', newMode as PreviousModeValue)
      }
    }
  }
}

export = HeatzyDevice
