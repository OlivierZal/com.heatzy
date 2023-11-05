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
import { isFirstGen, isFirstPilot, isGlow } from '../../utils'

export = class HeatzyDriver extends withAPI(Driver) {
  #app!: HeatzyApp

  // eslint-disable-next-line @typescript-eslint/require-await
  public async onInit(): Promise<void> {
    this.#app = this.homey.app as HeatzyApp
    this.registerFlowListeners()
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

  public getRequiredCapabilities(
    productKey: string,
    productName: string | undefined,
  ): string[] {
    if (isFirstGen(productKey)) {
      return ['onoff', 'mode']
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    return (this.manifest.capabilities as string[]).filter(
      (capability: string) => {
        if (capability.startsWith('target_temperature')) {
          return isGlow(productKey)
        }
        return isFirstPilot(productName)
          ? capability !== 'mode_3'
          : capability !== 'mode'
      },
    )
  }

  private async discoverDevices(): Promise<DeviceDetails[]> {
    try {
      const { data } = await this.api.get<Bindings>('/bindings')
      /* eslint-disable camelcase */
      return data.devices.map(
        ({ dev_alias, did, product_key, product_name }): DeviceDetails => ({
          name: dev_alias,
          data: {
            id: did,
            productKey: product_key,
            productName: product_name,
          },
          capabilities: this.getRequiredCapabilities(product_key, product_name),
        }),
      )
      /* eslint-enable camelcase */
    } catch (error: unknown) {
      return []
    }
  }

  private registerFlowListeners(): void {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    ;(this.manifest.capabilities as string[])
      .filter((capability: string) => capability.startsWith('mode'))
      .forEach((capability: string): void => {
        this.homey.flow
          .getConditionCard(`${capability}_condition`)
          .registerRunListener(
            (args: FlowArgs): boolean =>
              args.mode ===
              (args.device.getCapabilityValue(capability) as Mode),
          )
        this.homey.flow
          .getActionCard(`${capability}_action`)
          .registerRunListener(async (args: FlowArgs): Promise<void> => {
            await args.device.triggerCapabilityListener(capability, args.mode)
          })
      })
  }
}
