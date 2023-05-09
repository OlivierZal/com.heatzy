import { Device } from 'homey'
import type HeatzyDriver from './driver'
import type HeatzyApp from '../../app'
import {
  type CapabilityValue,
  type Mode,
  type ModeNumber,
  type ModeString,
  type Settings
} from '../../types'

function reverseMapping(
  mapping: Record<number, string>
): Record<string, number> {
  return Object.entries(mapping).reduce<Record<string, number>>(
    (reversedMapping, [deviceValue, capabilityValue]: [string, string]) => {
      reversedMapping[capabilityValue] = Number(deviceValue)
      return reversedMapping
    },
    {}
  )
}

const modeFromNumber: Record<ModeNumber, Mode> = {
  0: 'cft',
  1: 'eco',
  2: 'fro',
  3: 'stop'
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
  停止: 'stop'
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
    const success: boolean = await this.app.setDeviceMode(this, modeNumber)
    if (!success) {
      this.mode = this.isOn ? this.previousMode : 'stop'
    }
    await this.sync()
  }

  async syncFromDevice(): Promise<void> {
    const modeString: ModeString | null = await this.app.getDeviceMode(this)
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
    changedKeys
  }: {
    newSettings: Settings
    changedKeys: string[]
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
