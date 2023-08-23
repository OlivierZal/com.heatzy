import { Driver } from 'homey' // eslint-disable-line import/no-extraneous-dependencies
import type PairSession from 'homey/lib/PairSession'
import type HeatzyApp from '../../app'
import type { DeviceDetails, FlowArgs, LoginCredentials } from '../../types'

export = class HeatzyDriver extends Driver {
  app!: HeatzyApp

  // eslint-disable-next-line @typescript-eslint/require-await
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
      (data: LoginCredentials): Promise<boolean> => this.app.login(data)
    )
    session.setHandler(
      'list_devices',
      (): Promise<DeviceDetails[]> => this.app.listDevices()
    )
  }

  onRepair(session: PairSession): void {
    session.setHandler(
      'login',
      (data: LoginCredentials): Promise<boolean> => this.app.login(data)
    )
  }
}
