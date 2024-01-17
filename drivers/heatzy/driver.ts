import { Driver } from 'homey' // eslint-disable-line import/no-extraneous-dependencies
import type PairSession from 'homey/lib/PairSession'
import type HeatzyApp from '../../app'
import withAPI from '../../mixins/withAPI'
import type {
  Bindings,
  Capabilities,
  DeviceDetails,
  FlowArgs,
  LoginCredentials,
} from '../../types'
import { isFirstGen, isFirstPilot, isGlow } from '../../utils'

export = class HeatzyDriver extends withAPI(Driver) {
  readonly #app: HeatzyApp = this.homey.app as HeatzyApp

  // eslint-disable-next-line @typescript-eslint/require-await
  public async onInit(): Promise<void> {
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
    productName: string,
  ): string[] {
    if (isFirstGen(productKey)) {
      return ['onoff', 'mode']
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    return (this.manifest.capabilities as (keyof Capabilities)[]).filter(
      (capability: string) => {
        if (capability.startsWith('target_temperature')) {
          return isGlow(productKey)
        }
        return isFirstPilot(productName)
          ? capability !== 'mode3'
          : capability !== 'mode'
      },
    )
  }

  private async discoverDevices(): Promise<DeviceDetails[]> {
    try {
      const { data } = await this.api.get<Bindings>('/bindings')

      return data.devices.map(
        ({
          dev_alias: name,
          did,
          product_key: productKey,
          product_name: productName,
        }): DeviceDetails => ({
          name,
          data: { id: did, productKey, productName },
          capabilities: this.getRequiredCapabilities(productKey, productName),
        }),
      )
    } catch (error: unknown) {
      return []
    }
  }

  private registerFlowListeners(): void {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    ;(this.manifest.capabilities as (keyof Capabilities)[]).forEach(
      (capability: keyof Capabilities) => {
        switch (true) {
          case capability.startsWith('mode'):
            this.homey.flow
              .getConditionCard(`${capability}_condition`)
              .registerRunListener(
                (args: FlowArgs): boolean =>
                  args.mode === args.device.getCapabilityValue(capability),
              )
            this.homey.flow
              .getActionCard(`${capability}_action`)
              .registerRunListener(async (args: FlowArgs): Promise<void> => {
                await args.device.onCapability(capability, args.mode)
              })
            break
          case capability === 'derog_time_boost':
          case capability === 'onoff.timer':
            this.homey.flow
              .getConditionCard(`${capability}_condition`)
              .registerRunListener((args: FlowArgs): boolean =>
                capability === 'derog_time_boost'
                  ? !!Number(args.device.getCapabilityValue('derog_time_boost'))
                  : args.device.getCapabilityValue('onoff.timer'),
              )
            this.homey.flow
              .getActionCard(`${capability}_action`)
              .registerRunListener(async (args: FlowArgs): Promise<void> => {
                await args.device.onCapability(
                  capability,
                  capability === 'derog_time_boost'
                    ? args.derog_time
                    : args.onoff,
                )
              })
            break
          case capability.startsWith('target_temperature.'):
            this.homey.flow
              .getActionCard(`${capability}_action`)
              .registerRunListener(async (args: FlowArgs): Promise<void> => {
                await args.device.onCapability(
                  capability,
                  args.target_temperature,
                )
              })
            break
          default:
        }
      },
    )
  }
}
