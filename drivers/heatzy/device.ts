// eslint-disable-next-line import/no-extraneous-dependencies
import { Device } from 'homey'
import axios from 'axios'
import type HeatzyDriver from './driver'
import type HeatzyApp from '../../app'
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
  return Object.entries(mapping).reduce<Record<string, number>>(
    (reversedMapping, [deviceValue, capabilityValue]: [string, string]) => ({
      ...reversedMapping,
      [capabilityValue]: Number(deviceValue),
    }),
    {}
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

export default class HeatzyDevice extends Device {
  app!: HeatzyApp

  declare driver: HeatzyDriver

  id!: string

  productKey!: string

  mode!: Mode

  isOn!: boolean

  onMode!: Exclude<Mode, 'stop'> | null

  previousMode!: Exclude<Mode, 'stop'>

  syncTimeout!: NodeJS.Timeout

  async onInit(): Promise<void> {
    this.app = this.homey.app as HeatzyApp

    const { id, productKey } = this.getData()
    this.id = id
    this.productKey = productKey

    this.setOnMode()
    this.previousMode = this.getOnMode()
    this.registerCapabilityListeners()
    await this.syncFromDevice()
  }

  async getDeviceMode(): Promise<ModeString | null> {
    try {
      this.log('Syncing from device...')
      const { data } = await axios.get<DeviceData>(`devdata/${this.id}/latest`)
      this.log('Syncing from device:\n', data)
      const { mode } = data.attr
      if (mode === undefined) {
        throw new Error('mode is undefined')
      }
      return mode
    } catch (error: unknown) {
      this.error(
        'Syncing from device:',
        error instanceof Error ? error.message : error
      )
    }
    return null
  }

  async setDeviceMode(mode: ModeNumber): Promise<boolean> {
    try {
      const postData: DevicePostData = formatDevicePostData(
        mode,
        this.productKey
      )
      this.log('Syncing with device...\n', postData)
      const { data } = await axios.post<Data>(`/control/${this.id}`, postData)
      this.log('Syncing with device:\n', data)
      if ('error_message' in data) {
        throw new Error(data.error_message)
      }
      return true
    } catch (error: unknown) {
      this.error(
        'Syncing with device:',
        error instanceof Error ? error.message : error
      )
    }
    return false
  }

  setOnMode(
    onModeSetting: Exclude<Mode, 'stop'> | 'previous' = this.getSetting(
      'on_mode'
    )
  ): void {
    this.onMode = onModeSetting !== 'previous' ? onModeSetting : null
  }

  getOnMode(): Exclude<Mode, 'stop'> {
    return this.onMode ?? this.previousMode ?? 'eco'
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
      this.mode = this.previousMode
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
      this.mode = this.isOn ? this.previousMode : 'stop'
    }
    await this.sync()
  }

  async syncFromDevice(): Promise<void> {
    const modeString: ModeString | null = await this.getDeviceMode()
    this.mode = modeString !== null ? modeFromString[modeString] : 'stop'
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
    this.setPreviousMode()
  }

  setPreviousMode(): void {
    if (this.mode !== 'stop') {
      this.previousMode = this.mode
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
      this.setOnMode(newSettings.on_mode)
    }
    if (
      changedKeys.includes('always_on') &&
      newSettings.always_on === true &&
      this.getCapabilityValue('onoff') === false
    ) {
      await this.onCapability('onoff', true)
    }
  }

  async onDeleted(): Promise<void> {
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
      await super
        .setCapabilityValue(capability, value)
        .then((): void => {
          this.log('Capability', capability, 'is', value)
        })
        .catch(this.error)
    }
  }

  log(...args: any[]): void {
    super.log(this.getName(), '-', ...args)
  }

  error(...args: any[]): void {
    super.error(this.getName(), '-', ...args)
  }
}

module.exports = HeatzyDevice
