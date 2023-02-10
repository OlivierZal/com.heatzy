import { Driver } from 'homey'
import type PairSession from 'homey/lib/PairSession'
import type HeatzyApp from '../../app'
import {
  type DeviceDetails,
  type FlowArgs,
  type LoginCredentials
} from '../../types'

export default class HeatzyDriver extends Driver {
  app!: HeatzyApp
  deviceType!: number
  heatPumpType!: string

  async onInit(): Promise<void> {
    this.app = this.homey.app as HeatzyApp

    this.homey.flow
      .getConditionCard('mode_condition')
      .registerRunListener(
        (args: FlowArgs): boolean =>
          args.mode === args.device.getCapabilityValue('mode')
      )
    this.homey.flow
      .getActionCard('mode_action')
      .registerRunListener(async (args: FlowArgs): Promise<void> => {
        await args.device.onCapability('mode', args.mode)
      })
  }

  onPair(session: PairSession): void {
    session.setHandler(
      'login',
      async (data: LoginCredentials): Promise<boolean> =>
        await this.app.login(data)
    )
    session.setHandler(
      'list_devices',
      async (): Promise<DeviceDetails[]> => await this.app.listDevices()
    )
  }

  onRepair(session: PairSession): void {
    session.setHandler(
      'login',
      async (data: LoginCredentials): Promise<boolean> =>
        await this.app.login(data)
    )
  }
}

module.exports = HeatzyDriver
