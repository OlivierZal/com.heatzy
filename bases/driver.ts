import { Driver } from 'homey' // eslint-disable-line import/no-extraneous-dependencies
import type PairSession from 'homey/lib/PairSession'
import type HeatzyApp from '../app'
import withAPI from '../mixins/withAPI'
import type {
  Bindings,
  DeviceDetails,
  FlowArgs,
  LoginCredentials,
  Mode,
} from '../types'

function isFirstGen(productKey: string): boolean {
  return productKey === '9420ae048da545c88fc6274d204dd25f'
}

export default abstract class BaseHeatzyDriver extends withAPI(Driver) {
  public isFirstGen = false

  #app!: HeatzyApp

  // eslint-disable-next-line @typescript-eslint/require-await
  public async onInit(): Promise<void> {
    this.#app =     this.homey.app as HeatzyApp

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

  protected async discoverDevices(): Promise<DeviceDetails[]> {
    try {
      const { data } = await this.api.get<Bindings>('/bindings')
      /* eslint-disable camelcase */
      return data.devices
        .filter(({ product_key }) =>
          this.isFirstGen ? isFirstGen(product_key) : !isFirstGen(product_key),
        )
        .map(
          ({ dev_alias, did, product_key }): DeviceDetails => ({
            name: dev_alias,
            data: {
              id: did,
              productKey: product_key,
            },
          }),
        )
      /* eslint-enable camelcase */
    } catch (error: unknown) {
      return []
    }
  }
}
