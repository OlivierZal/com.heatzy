import type {
  Capabilities,
  DeviceDetails,
  FlowArgs,
  LoginCredentials,
} from '../../types/types'
import { isFirstGen, isFirstPilot, isGlow } from '../../utils'
import { Driver } from 'homey'
import type HeatzyApp from '../../app'
import type PairSession from 'homey/lib/PairSession'

export = class HeatzyDriver extends Driver {
  readonly #app: HeatzyApp = this.homey.app as HeatzyApp

  // eslint-disable-next-line @typescript-eslint/require-await
  public async onInit(): Promise<void> {
    this.#registerRunListeners()
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  public async onPair(session: PairSession): Promise<void> {
    session.setHandler(
      'login',
      async (data: LoginCredentials): Promise<boolean> => this.#app.login(data),
    )
    session.setHandler(
      'list_devices',
      async (): Promise<DeviceDetails[]> => this.#discoverDevices(),
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

  async #discoverDevices(): Promise<DeviceDetails[]> {
    try {
      return (await this.#app.heatzyAPI.bindings()).data.devices.map(
        ({
          dev_alias: name,
          did,
          product_key: productKey,
          product_name: productName,
        }): DeviceDetails => ({
          capabilities: this.getRequiredCapabilities(productKey, productName),
          data: { id: did, productKey, productName },
          name,
        }),
      )
    } catch (error: unknown) {
      return []
    }
  }

  #registerRunListeners(): void {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    ;(this.manifest.capabilities as (keyof Capabilities)[]).forEach(
      (capability: keyof Capabilities) => {
        if (capability.startsWith('mode')) {
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
        } else if (['derog_time_boost', 'onoff.timer'].includes(capability)) {
          this.homey.flow
            .getConditionCard(`${capability}_condition`)
            .registerRunListener((args: FlowArgs): boolean =>
              capability === 'derog_time_boost'
                ? Boolean(
                    Number(args.device.getCapabilityValue('derog_time_boost')),
                  )
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
        } else if (capability.startsWith('target_temperature.')) {
          this.homey.flow
            .getActionCard(`${capability}_action`)
            .registerRunListener(async (args: FlowArgs): Promise<void> => {
              await args.device.onCapability(
                capability,
                args.target_temperature,
              )
            })
        }
      },
    )
  }
}
