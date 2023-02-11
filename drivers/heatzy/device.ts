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

function reverse(
  mapping: Record<ModeNumber, Mode>
): Partial<Record<Mode, ModeNumber>> {
  const reversedMapping: Partial<Record<Mode, ModeNumber>> = {}
  for (const [capabilityValue, deviceValue] of Object.entries(mapping)) {
    reversedMapping[deviceValue] = Number(capabilityValue) as ModeNumber
  }
  return reversedMapping
}

const modeFromNumber: Record<ModeNumber, Mode> = {
  0: 'cft',
  1: 'eco',
  2: 'fro',
  3: 'stop'
} as const

const modeToNumber: Partial<Record<Mode, ModeNumber>> = reverse(modeFromNumber)

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
  previousMode!: Exclude<Mode, 'stop'>
  syncTimeout!: NodeJS.Timeout

  async onInit(): Promise<void> {
    this.app = this.homey.app as HeatzyApp

    const { id, productKey } = this.getData()
    this.id = id
    this.productKey = productKey
    this.previousMode = 'eco'
    this.registerCapabilityListeners()
    await this.syncFromDevice()
  }

  registerCapabilityListeners(): void {
    for (const capability of this.driver.manifest.capabilities) {
      this.registerCapabilityListener(
        capability,
        async (value: CapabilityValue): Promise<void> => {
          await this.onCapability(capability, value)
        }
      )
    }
  }

  async onCapability(
    capability: string,
    value: CapabilityValue
  ): Promise<void> {
    this.clearSyncPlan()
    const alwaysOn: boolean = this.getSetting('always_on') === true
    this.mode =
      capability === 'onoff'
        ? value === true
          ? this.previousMode
          : 'stop'
        : (value as Mode)
    if (alwaysOn && this.mode === 'stop') {
      await this.setWarning('"Power Off" is disabled.')
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
    const modeNumber: ModeNumber | undefined = modeToNumber[this.mode]
    if (modeNumber !== undefined) {
      await this.app.setDeviceMode(this, modeNumber)
    }
    await this.sync()
  }

  async syncFromDevice(): Promise<void> {
    const modeString: ModeString | null = await this.app.getDeviceMode(this)
    await this.sync(modeFromString[modeString ?? 'stop'])
  }

  async sync(mode?: Mode): Promise<void> {
    await this.updateCapabilities(mode)
    this.planSyncFromDevice(this.getSetting('interval') * 60000)
  }

  async updateCapabilities(mode: Mode = this.mode): Promise<void> {
    if (mode !== 'stop') {
      this.previousMode = mode
    }
    await this.setCapabilityValue('onoff', mode !== 'stop')
    await this.setCapabilityValue('mode', mode)
  }

  planSyncFromDevice(ms: number): void {
    this.clearSyncPlan()
    this.syncTimeout = this.homey.setTimeout(async (): Promise<void> => {
      await this.syncFromDevice()
    }, ms)
    this.log('Next sync in', ms / 1000, 'seconds')
  }

  async onSettings({
    newSettings,
    changedKeys
  }: {
    newSettings: Settings
    changedKeys: string[]
  }): Promise<void> {
    if (
      changedKeys.includes('always_on') &&
      newSettings.always_on === true &&
      this.getCapabilityValue('onoff') === false
    ) {
      await this.onCapability('onoff', true)
    } else if (
      changedKeys.some((setting: string): boolean => setting !== 'always_on')
    ) {
      this.planSyncFromDevice(1000)
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
