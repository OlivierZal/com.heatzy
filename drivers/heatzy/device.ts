import { Device } from 'homey' // eslint-disable-line import/no-extraneous-dependencies
import type HeatzyDriver from './driver'
import type HeatzyApp from '../../app'
import WithAPIAndLogging from '../../mixin'
import type {
  CapabilityValue,
  Data,
  DeviceData,
  DevicePostData,
  Mode,
  ModeNumber,
  ModeString,
  Settings,
} from '../../types'

function isPiloteFirstGen(productKey: string): boolean {
  return productKey === '9420ae048da545c88fc6274d204dd25f'
}

function formatDevicePostData(
  mode: ModeNumber,
  productKey: string
): DevicePostData {
  if (isPiloteFirstGen(productKey)) {
    return { raw: [1, 1, mode] }
  }
  return { attrs: { mode } }
}

function reverseMapping(
  mapping: Record<number, string>
): Record<string, number> {
  return Object.fromEntries(
    Object.entries(mapping).map(
      ([deviceValue, capabilityValue]: [string, string]): [string, number] => [
        capabilityValue,
        Number(deviceValue),
      ]
    )
  )
}

const modeFromNumber: Record<ModeNumber, Mode> = {
  0: 'cft',
  1: 'eco',
  2: 'fro',
  3: 'stop',
} as const

const modeToNumber: Record<Mode, ModeNumber> = reverseMapping(
  modeFromNumber
) as Record<Mode, ModeNumber>

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

export = class HeatzyDevice extends WithAPIAndLogging(Device) {
  app!: HeatzyApp

  declare driver: HeatzyDriver

  id!: string

  productKey!: string

  mode!: Mode

  isOn!: boolean

  onMode!: Exclude<Mode, 'stop'> | null

  syncTimeout!: NodeJS.Timeout

  async onInit(): Promise<void> {
    this.app = this.homey.app as HeatzyApp

    const { id, productKey } = this.getData()
    this.id = id
    this.productKey = productKey

    if (this.getStoreValue('previous_mode') === undefined) {
      await this.setStoreValue('previous_mode', 'eco')
    }
    this.setOnMode()
    this.registerCapabilityListeners()
    await this.syncFromDevice()
  }

  async getDeviceMode(): Promise<ModeString | null> {
    try {
      const { data } = await this.api.get<DeviceData>(
        `devdata/${this.id}/latest`
      )
      return data.attr.mode
    } catch (error: unknown) {
      return null
    }
  }

  async setDeviceMode(mode: ModeNumber): Promise<boolean> {
    try {
      const postData: DevicePostData = formatDevicePostData(
        mode,
        this.productKey
      )
      const { data } = await this.api.post<Data>(
        `/control/${this.id}`,
        postData
      )
      if ('error_message' in data) {
        throw new Error(data.error_message)
      }
      return true
    } catch (error: unknown) {
      return false
    }
  }

  setOnMode(
    onModeSetting: Exclude<Mode, 'stop'> | 'previous' = this.getSetting(
      'on_mode'
    )
  ): void {
    this.onMode = onModeSetting !== 'previous' ? onModeSetting : null
  }

  getOnMode(): Exclude<Mode, 'stop'> {
    return (
      this.onMode ??
      (this.getStoreValue('previous_mode') as Exclude<Mode, 'stop'>)
    )
  }

  registerCapabilityListeners(): void {
    this.driver.manifest.capabilities.forEach((capability: string): void => {
      this.registerCapabilityListener(
        capability,
        async (value: CapabilityValue): Promise<void> => {
          await this.onCapability(capability, value)
        }
      )
    })
  }

  async onCapability(
    capability: string,
    value: CapabilityValue
  ): Promise<void> {
    if (capability === 'onoff' && value === this.isOn) {
      return
    }
    this.clearSyncPlan()
    const alwaysOn: boolean = this.getSetting('always_on') === true
    if (capability === 'onoff') {
      this.mode = value === true ? this.getOnMode() : 'stop'
    } else {
      this.mode = value as Mode
    }
    if (this.mode === 'stop' && alwaysOn) {
      await this.setWarning(this.homey.__('warnings.always_on'))
      await this.setWarning(null)
      this.mode = this.getStoreValue('previous_mode')
    }
    this.applySyncToDevice()
  }

  applySyncToDevice(): void {
    this.syncTimeout = this.homey.setTimeout(async (): Promise<void> => {
      await this.syncToDevice()
    }, 1000)
  }

  clearSyncPlan(): void {
    this.homey.clearTimeout(this.syncTimeout)
    this.log('Sync has been paused')
  }

  async syncToDevice(): Promise<void> {
    const modeNumber: ModeNumber = modeToNumber[this.mode]
    const success: boolean = await this.setDeviceMode(modeNumber)
    if (!success) {
      this.mode = this.isOn ? this.getStoreValue('previous_mode') : 'stop'
    }
    await this.sync()
  }

  async syncFromDevice(): Promise<void> {
    const modeString: ModeString | null = await this.getDeviceMode()
    this.mode =
      modeString !== null && modeString in modeFromString
        ? modeFromString[modeString]
        : 'stop'
    await this.sync()
  }

  async sync(): Promise<void> {
    await this.updateCapabilities()
    this.planSyncFromDevice(60000)
  }

  async updateCapabilities(): Promise<void> {
    this.isOn = this.mode !== 'stop'
    await this.setCapabilityValue('onoff', this.isOn)
    await this.setCapabilityValue('mode', this.mode)
    if (this.mode !== 'stop') {
      await this.setStoreValue('previous_mode', this.mode)
    }
  }

  planSyncFromDevice(ms: number): void {
    this.clearSyncPlan()
    this.syncTimeout = this.homey.setTimeout(async (): Promise<void> => {
      await this.syncFromDevice()
    }, ms)
    this.log('Next sync in', ms / 1000, 'second(s)')
  }

  async onSettings({
    newSettings,
    changedKeys,
  }: {
    changedKeys: string[]
    newSettings: Settings
  }): Promise<void> {
    if (changedKeys.includes('on_mode')) {
      this.setOnMode(newSettings.on_mode as Exclude<Mode, 'stop'>)
    }
    if (
      changedKeys.includes('always_on') &&
      newSettings.always_on === true &&
      this.getCapabilityValue('onoff') === false
    ) {
      await this.onCapability('onoff', true)
    }
  }

  onDeleted(): void {
    this.clearSyncPlan()
  }

  async setCapabilityValue(
    capability: string,
    value: CapabilityValue
  ): Promise<void> {
    if (
      this.hasCapability(capability) &&
      value !== this.getCapabilityValue(capability)
    ) {
      try {
        await super.setCapabilityValue(capability, value)
        this.log('Capability', capability, 'is', value)
      } catch (error: unknown) {
        this.error(error instanceof Error ? error.message : error)
      }
    }
  }
}
