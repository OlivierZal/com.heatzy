import { Device } from 'homey' // eslint-disable-line import/no-extraneous-dependencies
import type BaseHeatzyDriver from './driver'
import addToLogs from '../decorators/addToLogs'
import withAPI from '../mixins/withAPI'
import type {
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
} from '../types'

function booleanToSwitch(value: boolean): Switch {
  return Number(value) as Switch
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

const modeFromNumber: Record<ModeNumber, Mode> = [
  'cft',
  'eco',
  'fro',
  'stop',
] as const

const modeFromString: Record<ModeString, Mode> = {
  cft: 'cft',
  cft1: 'cft',
  cft2: 'cft',
  舒适: 'cft',
  eco: 'eco',
  经济: 'eco',
  fro: 'fro',
  解冻: 'fro',
  stop: 'stop',
  停止: 'stop',
} as const

@addToLogs('getName()')
abstract class BaseHeatzyDevice extends withAPI(Device) {
  public declare driver: BaseHeatzyDriver

  protected modeToNumber: Record<Mode, ModeNumber> = reverseMapping(
    modeFromNumber,
  ) as Record<Mode, ModeNumber>

  #onMode!: Exclude<Mode, 'stop'>

  #id!: string

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
    await this.handleCapabilities()

    if (this.getStoreValue('previous_mode') === null) {
      await this.setStoreValue('previous_mode', 'eco')
    }

    const { id } = this.getData() as DeviceDetails['data']
    this.#id = id
    this.onMode = this.getSetting('on_mode') as OnMode
    this.registerCapabilityListeners()
    await this.syncFromDevice()
  }

  public async onCapability(
    capability: string,
    value: CapabilityValue,
  ): Promise<void> {
    this.clearSyncPlan()
    let mode: Mode | null = null
    switch (capability) {
      case 'onoff':
      case 'mode':
        mode = await this.getMode(capability, value)
        if (mode) {
          await this.setDeviceData(this.buildPostDataMode(mode))
        }
        break
      case 'onoff.boost':
        await this.setDeviceData({
          attrs: {
            boost_switch: booleanToSwitch(value as boolean),
          },
        })
        break
      case 'locked':
        await this.setDeviceData({
          attrs: {
            lock_switch: booleanToSwitch(value as boolean),
          },
        })
        break
      case 'onoff.timer':
        await this.setDeviceData({
          attrs: {
            timer_switch: booleanToSwitch(value as boolean),
          },
        })
        break
      case 'vacation_remaining_days':
        await this.setDeviceData({
          attrs: {
            derog_time: Number(value),
          },
        })
        await this.setDeviceData({
          attrs: {
            derog_mode: booleanToSwitch(
              Boolean(
                Number(this.getCapabilityValue('vacation_remaining_days')),
              ),
            ),
          },
        })
        break
      default:
    }
    this.planSyncFromDevice()
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
    this.clearSyncPlan()
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

  /* eslint-disable camelcase */
  protected async updateCapabilities(
    attr?: DeviceData['attr'] | DevicePostData['attrs'] | null,
  ): Promise<void> {
    if (!attr) {
      return
    }
    const {
      mode,
      boost_switch,
      lock_switch,
      timer_switch,
      derog_mode,
      derog_time,
    } = attr
    if (mode !== undefined) {
      const newMode: Mode =
        typeof mode === 'string' ? modeFromString[mode] : modeFromNumber[mode]
      await this.setCapabilityValue('mode', newMode)
      const isOn: boolean = newMode !== 'stop'
      await this.setCapabilityValue('onoff', isOn)
      if (isOn) {
        await this.setStoreValue('previous_mode', newMode)
      }
    }
    if (boost_switch !== undefined) {
      await this.setCapabilityValue('onoff.boost', Boolean(boost_switch))
    }
    if (lock_switch !== undefined) {
      await this.setCapabilityValue('locked', Boolean(lock_switch))
    }
    if (timer_switch !== undefined) {
      await this.setCapabilityValue('onoff.timer', Boolean(timer_switch))
    }
    if (derog_time !== undefined) {
      await this.setCapabilityValue(
        'vacation_remaining_days',
        String(derog_mode === undefined || derog_mode === 1 ? derog_time : 0),
      )
    }
  }
  /* eslint-enable camelcase */

  private async handleCapabilities(): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    await (this.driver.manifest.capabilities as string[]).reduce<Promise<void>>(
      async (acc, capability: string) => {
        await acc
        return this.addCapability(capability)
      },
      Promise.resolve(),
    )
  }

  private async getMode(
    capability: 'mode' | 'onoff',
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
          capability === 'mode'
            ? (this.getStoreValue('previous_mode') as Exclude<Mode, 'stop'>)
            : true,
        ),
      1000,
    )
    return null
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

  private async setDeviceData(
    postData: DevicePostData | FirstGenDevicePostData,
  ): Promise<void> {
    const success: boolean = await this.control(postData)
    await this.handleSuccess(success, postData)
  }

  private async control(
    postData: DevicePostData | FirstGenDevicePostData,
  ): Promise<boolean> {
    try {
      const { data } = await this.api.post<Data>(
        `/control/${this.#id}`,
        postData,
      )
      if ('error_message' in data) {
        throw new Error(data.error_message)
      }
      return true
    } catch (error: unknown) {
      return false
    }
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

  private clearSyncPlan(): void {
    this.homey.clearTimeout(this.#syncTimeout)
    this.log('Sync has been paused')
  }

  private async syncFromDevice(): Promise<void> {
    const attr: DeviceData['attr'] | null = await this.getDeviceData()
    await this.updateCapabilities(attr)
    this.planSyncFromDevice()
  }

  private planSyncFromDevice(): void {
    this.#syncTimeout = this.homey.setTimeout(async (): Promise<void> => {
      await this.syncFromDevice()
    }, 60000)
    this.log('Next sync in 1 minute')
  }

  protected abstract buildPostDataMode(
    mode: Mode,
  ): DevicePostData | FirstGenDevicePostData

  protected abstract handleSuccess(
    success: boolean,
    postData: DevicePostData | FirstGenDevicePostData,
  ): Promise<void>
}

export default BaseHeatzyDevice
