import { DeviceModel, type LoginPostData } from '@olivierzal/heatzy-api'
// eslint-disable-next-line import/default, import/no-extraneous-dependencies
import Homey from 'homey'

import {
  getCapabilitiesOptions,
  type DeviceDetails,
  type FlowArgs,
  type ManifestDriver,
} from '../../types.mts'

import type PairSession from 'homey/lib/PairSession'

import type HeatzyDevice from './device.mts'

const discoverDevices = async (): Promise<DeviceDetails[]> =>
  Promise.resolve(
    DeviceModel.getAll().map(({ doesNotSupportExtendedMode, id, name }) => ({
      capabilitiesOptions: getCapabilitiesOptions(doesNotSupportExtendedMode),
      data: { id },
      name,
    })),
  )

// eslint-disable-next-line import/no-named-as-default-member
export default class HeatzyDriver extends Homey.Driver {
  declare public readonly getDevices: () => HeatzyDevice[]

  declare public readonly homey: Homey.Homey

  declare public readonly manifest: ManifestDriver

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
    session.setHandler('list_devices', async () => discoverDevices())
    return Promise.resolve()
  }

  public override async onRepair(session: PairSession): Promise<void> {
    this.#handleLogin(session)
    return Promise.resolve()
  }

  #handleLogin(session: PairSession): void {
    session.setHandler('login', async (data: LoginPostData) =>
      this.#login(data),
    )
  }

  async #login(data?: LoginPostData): Promise<boolean> {
    return this.homey.app.api.authenticate(data)
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
