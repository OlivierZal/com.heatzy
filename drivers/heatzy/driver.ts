import { Driver } from 'homey'
import type PairSession from 'homey/lib/PairSession'
import type HeatzyApp from '../../app'
import { type DeviceDetails, type LoginPostData } from '../../types'

export default class HeatzyDriver extends Driver {
  app!: HeatzyApp
  deviceType!: number
  heatPumpType!: string

  async onInit(): Promise<void> {
    this.app = this.homey.app as HeatzyApp
  }

  onPair(session: PairSession): void {
    session.setHandler(
      'login',
      async (data: LoginPostData): Promise<boolean> =>
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
      async (data: LoginPostData): Promise<boolean> =>
        await this.app.login(data)
    )
  }
}

module.exports = HeatzyDriver
