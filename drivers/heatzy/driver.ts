import type {
  Capabilities,
  DeviceDetails,
  FlowArgs,
  ModeCapability,
} from '../../types'
import { isFirstGen, isFirstPilot, isGlow } from '../../utils'
import { Driver } from 'homey'
import type HeatzyApp from '../../app'
import type { LoginCredentials } from '../../heatzy/types'
import type PairSession from 'homey/lib/PairSession'

export = class HeatzyDriver extends Driver {
  readonly #app: HeatzyApp = this.homey.app as HeatzyApp

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

  public async onInit(): Promise<void> {
    this.#registerRunListeners()
    return Promise.resolve()
  }

  public async onPair(session: PairSession): Promise<void> {
    session.setHandler(
      'login',
      async (data: LoginCredentials): Promise<boolean> =>
        this.#app.applyLogin(data),
    )
    session.setHandler(
      'list_devices',
      async (): Promise<DeviceDetails[]> => this.#discoverDevices(),
    )
    return Promise.resolve()
  }

  public async onRepair(session: PairSession): Promise<void> {
    session.setHandler(
      'login',
      async (data: LoginCredentials): Promise<boolean> =>
        this.#app.applyLogin(data),
    )
    return Promise.resolve()
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

  #registerDerogTimeRunListeners(): void {
    this.homey.flow
      .getConditionCard('derog_time_boost_condition')
      .registerRunListener((args: FlowArgs): boolean =>
        Boolean(Number(args.device.getCapabilityValue('derog_time_boost'))),
      )
    this.homey.flow
      .getActionCard('derog_time_boost_action')
      .registerRunListener(async (args: FlowArgs): Promise<void> => {
        await args.device.triggerCapabilityListener(
          'derog_time_boost',
          args.derog_time,
        )
      })
  }

  #registerModeRunListeners(capability: ModeCapability): void {
    this.homey.flow
      .getConditionCard(`${capability}_condition`)
      .registerRunListener(
        (args: FlowArgs): boolean =>
          args.device.getCapabilityValue(capability) === args.mode,
      )
    this.homey.flow
      .getActionCard(`${capability}_action`)
      .registerRunListener(async (args: FlowArgs): Promise<void> => {
        await args.device.triggerCapabilityListener(capability, args.mode)
      })
  }

  #registerOnOffRunListeners(): void {
    this.homey.flow
      .getConditionCard('onoff.timer_condition')
      .registerRunListener((args: FlowArgs): boolean =>
        args.device.getCapabilityValue('onoff.timer'),
      )
    this.homey.flow
      .getActionCard('onoff.timer_action')
      .registerRunListener(async (args: FlowArgs): Promise<void> => {
        await args.device.triggerCapabilityListener('onoff.timer', args.onoff)
      })
  }

  #registerRunListeners(): void {
    this.#registerDerogTimeRunListeners()
    this.#registerModeRunListeners('mode')
    this.#registerModeRunListeners('mode3')
    this.#registerOnOffRunListeners()
    this.#registerTargetTemperatureRunListener()
  }

  #registerTargetTemperatureRunListener(): void {
    this.homey.flow
      .getActionCard('target_temperature.complement_action')
      .registerRunListener(async (args: FlowArgs): Promise<void> => {
        await args.device.triggerCapabilityListener(
          'target_temperature.complement',
          args.target_temperature,
        )
      })
  }
}
