import { Driver } from 'homey' // eslint-disable-line import/no-extraneous-dependencies
import type PairSession from 'homey/lib/PairSession'
import type HeatzyApp from '../../app'
import withAPI from '../../mixins/withAPI'
import type {
  Bindings,
  DeviceDetails,
  FlowArgs,
  LoginCredentials,
  Mode,
} from '../../types'

export = class HeatzyDriver extends withAPI(Driver) {
  #app!: HeatzyApp

  // eslint-disable-next-line @typescript-eslint/require-await
  public async onInit(): Promise<void> {
    this.#app = this.homey.app as HeatzyApp

    this.homey.flow
      .getConditionCard('mode_condition')
      .registerRunListener(
        (args: FlowArgs): boolean =>
          args.mode === (args.device.getCapabilityValue('mode') as Mode),
      )
    this.homey.flow
      .getActionCard('mode_action')
      .registerRunListener(async (args: FlowArgs): Promise<void> => {
        await args.device.onCapability('mode', args.mode)
      })
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  public async onPair(session: PairSession): Promise<void> {
    session.setHandler(
      'login',
      async (data: LoginCredentials): Promise<boolean> => this.#app.login(data),
    )
    session.setHandler(
      'list_devices',
      async (): Promise<DeviceDetails[]> => this.discoverDevices(),
    )
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  public async onRepair(session: PairSession): Promise<void> {
    session.setHandler(
      'login',
      async (data: LoginCredentials): Promise<boolean> => this.#app.login(data),
    )
  }

  private async discoverDevices(): Promise<DeviceDetails[]> {
    try {
      const { data } = await this.api.get<Bindings>('/bindings')
      return data.devices.map(
        /* eslint-disable camelcase, @typescript-eslint/naming-convention */
        ({ dev_alias, did, product_key }): DeviceDetails => ({
          name: dev_alias,
          data: {
            id: did,
            productKey: product_key,
          },
        }),
        /* eslint-enable camelcase, @typescript-eslint/naming-convention */
      )
    } catch (error: unknown) {
      return []
    }
  }
}
