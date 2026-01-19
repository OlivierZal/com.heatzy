import type PairSession from 'homey/lib/PairSession'

// eslint-disable-next-line import-x/no-extraneous-dependencies
import Homey from 'homey'

import { type LoginPostData, DeviceModel } from '@olivierzal/heatzy-api'

import {
  type DeviceDetails,
  type FlowArgs,
  type ManifestDriver,
  getCapabilitiesOptions,
  getRequiredCapabilities,
} from '../../types.mts'

import type HeatzyDevice from './device.mts'

const discoverDevices = async (): Promise<DeviceDetails[]> =>
  // eslint-disable-next-line unicorn/no-useless-promise-resolve-reject
  Promise.resolve(
    DeviceModel.getAll().map(({ id, name, product }) => ({
      capabilities: getRequiredCapabilities(product),
      capabilitiesOptions: getCapabilitiesOptions(product),
      data: { id },
      name,
    })),
  )

// eslint-disable-next-line import-x/no-named-as-default-member
export default class HeatzyDriver extends Homey.Driver {
  declare public readonly getDevices: () => HeatzyDevice[]

  declare public readonly homey: Homey.Homey

  declare public readonly manifest: ManifestDriver

  public override async onInit(): Promise<void> {
    this.#registerRunListeners()
    // eslint-disable-next-line unicorn/no-useless-promise-resolve-reject
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
    // eslint-disable-next-line unicorn/no-useless-promise-resolve-reject
    return Promise.resolve()
  }

  public override async onRepair(session: PairSession): Promise<void> {
    this.#handleLogin(session)
    // eslint-disable-next-line unicorn/no-useless-promise-resolve-reject
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

  #registerDerogationTimeRunListeners(): void {
    this.homey.flow
      .getConditionCard('derog_time_condition')
      .registerRunListener(
        (args: FlowArgs) =>
          args.device.getCapabilityValue('derog_time') === args.derog_time,
      )
    this.homey.flow
      .getActionCard('derog_time_action')
      .registerRunListener(async (args: FlowArgs) => {
        await args.device.triggerCapabilityListener(
          'derog_time',
          args.derog_time,
        )
      })
  }

  #registerOnOffRunListeners(): void {
    for (const capability of [
      'onoff.timer',
      'onoff.window_detection',
    ] as const) {
      this.homey.flow
        .getConditionCard(`${capability}_condition`)
        .registerRunListener((args: FlowArgs) =>
          args.device.getCapabilityValue(capability),
        )
      this.homey.flow
        .getActionCard(`${capability}_action`)
        .registerRunListener(async (args: FlowArgs) => {
          await args.device.triggerCapabilityListener(capability, args.onoff)
        })
    }
  }

  #registerRunListeners(): void {
    this.#registerDerogationTimeRunListeners()
    this.#registerOnOffRunListeners()
    this.#registerTargetTemperatureRunListener()
  }

  #registerTargetTemperatureRunListener(): void {
    for (const capability of ['target_temperature.eco'] as const) {
      this.homey.flow
        .getActionCard(`${capability}_action`)
        .registerRunListener(async (args: FlowArgs) => {
          await args.device.triggerCapabilityListener(
            capability,
            args.target_temperature,
          )
        })
    }
  }
}
