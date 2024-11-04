import { DeviceModel, type LoginPostData } from '@olivierzal/heatzy-api'

import { Homey } from '../../homey.mjs'
import {
  getCapabilitiesOptions,
  type DeviceDetails,
  type FlowArgs,
  type ManifestDriver,
} from '../../types.mjs'

import type PairSession from 'homey/lib/PairSession'

import type HeatzyApp from '../../app.mjs'

export default class HeatzyDriver extends Homey.Driver {
  public capabilities = (this.manifest as ManifestDriver).capabilities ?? []

  public override async onInit(): Promise<void> {
    this.#registerRunListeners()
    return Promise.resolve()
  }

  public override async onPair(session: PairSession): Promise<void> {
    session.setHandler('showView', async (view) => {
      if (view === 'loading') {
        if (await this.#login()) {
          await session.showView('list_devices')
          return
        }
        await session.showView('login')
      }
    })
    this.#handleLogin(session)
    session.setHandler('list_devices', async () => this.#discoverDevices())
    return Promise.resolve()
  }

  public override async onRepair(session: PairSession): Promise<void> {
    this.#handleLogin(session)
    return Promise.resolve()
  }

  public getRequiredCapabilities({
    isFirstGen,
    isGlow,
  }: {
    isFirstGen: boolean
    isGlow: boolean
  }): string[] {
    return this.capabilities.filter((capability) =>
      isFirstGen ?
        ['onoff', 'thermostat_mode'].includes(capability)
      : isGlow || !capability.startsWith('target_temperature'),
    )
  }

  async #discoverDevices(): Promise<DeviceDetails[]> {
    return Promise.resolve(
      DeviceModel.getAll().map(
        ({ id, isFirstGen, isFirstPilot, isGlow, name }) => ({
          capabilities: this.getRequiredCapabilities({ isFirstGen, isGlow }),
          capabilitiesOptions: getCapabilitiesOptions(isFirstPilot),
          data: { id },
          name,
        }),
      ),
    )
  }

  #handleLogin(session: PairSession): void {
    session.setHandler('login', async (data: LoginPostData) =>
      this.#login(data),
    )
  }

  async #login(data?: LoginPostData): Promise<boolean> {
    return (this.homey.app as HeatzyApp).api.authenticate(data)
  }

  #registerDerogTimeRunListeners(): void {
    this.homey.flow
      .getConditionCard('derog_time_boost_condition')
      .registerRunListener((args: FlowArgs) =>
        Boolean(Number(args.device.getCapabilityValue('derog_time_boost'))),
      )
    this.homey.flow
      .getActionCard('derog_time_boost_action')
      .registerRunListener(async (args: FlowArgs) => {
        await args.device.triggerCapabilityListener(
          'derog_time_boost',
          args.derog_time,
        )
      })
  }

  #registerOnOffRunListeners(): void {
    this.homey.flow
      .getConditionCard('onoff.timer_condition')
      .registerRunListener((args: FlowArgs) =>
        args.device.getCapabilityValue('onoff.timer'),
      )
    this.homey.flow
      .getActionCard('onoff.timer_action')
      .registerRunListener(async (args: FlowArgs) => {
        await args.device.triggerCapabilityListener('onoff.timer', args.onoff)
      })
  }

  #registerRunListeners(): void {
    this.#registerDerogTimeRunListeners()
    this.#registerOnOffRunListeners()
    this.#registerTargetTemperatureRunListener()
  }

  #registerTargetTemperatureRunListener(): void {
    this.homey.flow
      .getActionCard('target_temperature.complement_action')
      .registerRunListener(async (args: FlowArgs) => {
        await args.device.triggerCapabilityListener(
          'target_temperature.complement',
          args.target_temperature,
        )
      })
  }
}
