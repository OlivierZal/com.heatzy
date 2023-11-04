import { Device } from 'homey' // eslint-disable-line import/no-extraneous-dependencies
import { DateTime } from 'luxon'
import type HeatzyDriver from './driver'
import addToLogs from '../../decorators/addToLogs'
import withAPI from '../../mixins/withAPI'
import type {
  BaseAttrs,
  CapabilityValue,
  Data,
  DeviceData,
  DeviceDetails,
  DevicePostData,
  FirstGenDevicePostData,
  Mode,
  ModeNumber,
  ModeString,
  OnMode,
  Settings,
  Switch,
} from '../../types'
import { isFirstGen, isFirstPilot } from '../../utils'

function booleanToSwitch(value: boolean): Switch {
  return Number(value) as Switch
}

function getDerogTime(derogMode: number, derogTime: number): string | null {
  if (!derogMode) {
    return null
  }
  const now: DateTime = DateTime.now()
  return derogMode === 1
    ? now.plus({ days: derogTime }).toLocaleString({
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      })
    : now.plus({ minutes: derogTime }).toLocaleString(DateTime.TIME_24_SIMPLE)
}

function reverseMapping(
  mapping: Record<number, string>,
): Record<string, number> {
  return Object.fromEntries(
    Object.entries(mapping).map(
      ([deviceValue, capabilityValue]: [string, string]): [string, number] => [
        capabilityValue,
        Number(deviceValue),
      ],
    ),
  )
}

const modeFromString: Record<ModeString, Mode> = {
  cft: 'cft',
  cft1: 'cft1',
  cft2: 'cft2',
  舒适: 'cft',
  eco: 'eco',
  经济: 'eco',
  fro: 'fro',
  解冻: 'fro',
  stop: 'stop',
  停止: 'stop',
} as const

const modeFromNumber: Record<ModeNumber, Mode> = [
  'cft',
  'eco',
  'fro',
  'stop',
  'cft1',
  'cft2',
] as const

const modeToNumber: Record<Mode, ModeNumber> = reverseMapping(
  modeFromNumber,
) as Record<Mode, ModeNumber>

@addToLogs('getName()')
class HeatzyDevice extends withAPI(Device) {
  public declare driver: HeatzyDriver

  #attrs: BaseAttrs = {}

  #id!: string

  #productKey!: string

  #productName!: string

  #mode!: 'mode_3' | 'mode'

  #onMode!: Exclude<Mode, 'stop'>

  #syncTimeout!: NodeJS.Timeout

  private get onMode(): Exclude<Mode, 'stop'> {
    return this.#onMode
  }

  private set onMode(value: OnMode) {
    this.#onMode =
      value === 'previous'
        ? (this.getStoreValue('previous_mode') as Exclude<Mode, 'stop'>)
        : value
  }

  public async onInit(): Promise<void> {
    const { id, productKey, productName } =
      this.getData() as DeviceDetails['data']
    this.#id = id
    this.#productKey = productKey
    this.#productName = productName
    await this.handleCapabilities()
    if (this.getStoreValue('previous_mode') === null) {
      await this.setStoreValue('previous_mode', 'eco')
    }

    this.#mode = isFirstPilot(this.#productKey) ? 'mode' : 'mode_3'
    this.onMode = this.getSetting('on_mode') as OnMode
    this.registerCapabilityListeners()
    await this.syncFromDevice()
  }

  public async onCapability(
    capability: string,
    value: CapabilityValue,
  ): Promise<void> {
    this.clearSync()
    let mode: Mode | null = null
    switch (capability) {
      case 'onoff':
      case this.#mode:
        mode = await this.getMode(capability, value)
        if (mode) {
          this.#attrs.mode = modeToNumber[mode]
        }
        break
      case 'derog_time_boost':
        this.#attrs.derog_mode = Number(value) ? 2 : 0
        this.#attrs.derog_time = Number(value)
        break
      case 'derog_time_vacation':
        this.#attrs.derog_mode = Number(value) ? 1 : 0
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

  public async onSettings({
    newSettings,
    changedKeys,
  }: {
    newSettings: Settings
    changedKeys: string[]
  }): Promise<void> {
    if (changedKeys.includes('on_mode')) {
      this.onMode = newSettings.on_mode as Exclude<Mode, 'stop'>
    }
    if (
      changedKeys.includes('always_on') &&
      newSettings.always_on === true &&
      this.getCapabilityValue('onoff') === false
    ) {
      await this.onCapability('onoff', true)
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
    const attr: DeviceData['attr'] | null = await this.getDeviceData()
    await this.updateCapabilities(attr)
    this.applySyncFromDevice()
  }

  private async getDeviceData(): Promise<DeviceData['attr'] | null> {
    try {
      const { data } = await this.api.get<DeviceData>(
        `devdata/${this.#id}/latest`,
      )
      return data.attr
    } catch (error: unknown) {
      return null
    }
  }

  private async updateCapabilities(
    attr: DeviceData['attr'] | DevicePostData['attrs'] | null,
    control = false,
  ): Promise<void> {
    if (!attr) {
      return
    }
    /* eslint-disable camelcase */
    const { mode, derog_mode, derog_time, lock_switch, timer_switch } = attr
    if (mode !== undefined) {
      const newMode: Mode =
        typeof mode === 'string' ? modeFromString[mode] : modeFromNumber[mode]
      await this.setCapabilityValue(this.#mode, newMode)
      const isOn: boolean = newMode !== 'stop'
      await this.setCapabilityValue('onoff', isOn)
      if (isOn) {
        await this.setStoreValue('previous_mode', newMode)
      }
    }
    if (derog_mode !== undefined && derog_time !== undefined) {
      if (control || derog_mode !== this.getDerogMode()) {
        await this.setCapabilityValue(
          'derog_end',
          getDerogTime(derog_mode, derog_time),
        )
      }
      const derogTime = String(derog_time)
      switch (derog_mode) {
        case 0:
          await this.setCapabilityValue('derog_time_boost', '0')
          await this.setCapabilityValue('derog_time_vacation', '0')
          break
        case 1:
          await this.setCapabilityValue('derog_time_vacation', derogTime)
          await this.setDisplayErrorWarning('derog_time_boost')
          break
        case 2:
          await this.setCapabilityValue('derog_time_boost', derogTime)
          await this.setDisplayErrorWarning('derog_time_vacation')
          break
        default:
      }
    }
    if (lock_switch !== undefined) {
      await this.setCapabilityValue('locked', Boolean(lock_switch))
    }
    if (timer_switch !== undefined) {
      await this.setCapabilityValue('onoff.timer', Boolean(timer_switch))
    }
    /* eslint-enable camelcase */
  }

  private getDerogMode(): 0 | 1 | 2 {
    if (this.getCapabilityValue('derog_time_boost') !== '0') {
      return 2
    }
    if (this.getCapabilityValue('derog_time_vacation') !== '0') {
      return 1
    }
    return 0
  }

  private applySyncFromDevice(): void {
    this.#syncTimeout = this.homey.setTimeout(async (): Promise<void> => {
      await this.syncFromDevice()
    }, 60000)
    this.log('Next sync in 1 minute')
  }

  private clearSync(): void {
    this.homey.clearTimeout(this.#syncTimeout)
    this.log('Sync has been paused')
  }

  private async getMode(
    capability: 'mode_3' | 'mode' | 'onoff',
    value: CapabilityValue,
  ): Promise<Mode | null> {
    let mode: Mode | null = null
    const alwaysOn: boolean = this.getSetting('always_on') as boolean
    if (capability === 'onoff') {
      mode = value === true ? this.onMode : 'stop'
    } else {
      mode = value as Mode
    }
    if (!alwaysOn || mode !== 'stop') {
      return mode
    }
    await this.setWarning(this.homey.__('warnings.always_on'))
    await this.setWarning(null)
    this.homey.setTimeout(
      async (): Promise<void> =>
        this.setCapabilityValue(
          capability,
          capability === this.#mode
            ? (this.getStoreValue('previous_mode') as Exclude<Mode, 'stop'>)
            : true,
        ),
      1000,
    )
    return null
  }

  private applySyncToDevice(): void {
    this.#syncTimeout = this.homey.setTimeout(async (): Promise<void> => {
      await this.syncToDevice()
    }, 1000)
    this.log('Next sync in 1 second')
  }

  private async syncToDevice(): Promise<void> {
    const postData: DevicePostData | FirstGenDevicePostData | null =
      this.buildPostData()
    if (postData) {
      const data: Data | null = await this.control(postData)
      if (data) {
        await this.updateCapabilities(
          'attrs' in postData ? postData.attrs : { mode: postData.raw[2] },
          true,
        )
      }
    }
    this.applySyncFromDevice()
  }

  private buildPostData(): DevicePostData | FirstGenDevicePostData | null {
    if (!Object.keys(this.#attrs).length) {
      return null
    }
    const postData: DevicePostData | FirstGenDevicePostData = isFirstGen(
      this.#productKey,
    )
      ? { raw: [1, 1, this.#attrs.mode as 0 | 1 | 2 | 3] }
      : { attrs: this.#attrs }
    this.#attrs = {}
    return postData
  }

  private async control(
    postData: DevicePostData | FirstGenDevicePostData,
  ): Promise<Data | null> {
    try {
      const { data } = await this.api.post<Data>(
        `/control/${this.#id}`,
        postData,
      )
      return data
    } catch (error: unknown) {
      return null
    }
  }

  private async setDisplayErrorWarning(capability: string): Promise<void> {
    if (this.getCapabilityValue(capability) !== '0') {
      await this.setCapabilityValue(capability, '0')
      await this.setWarning(this.homey.__('warnings.display_error'))
      await this.setWarning(null)
    }
  }
}

export = HeatzyDevice
