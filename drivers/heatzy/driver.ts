import type {
  DeviceDetails,
  FlowArgs,
  ManifestDriver,
  ModeCapability,
} from '../../types'
import { isFirstGen, isFirstPilot, isGlow } from '../../utils'
import { Driver } from 'homey'
import type HeatzyApp from '../..'
import type { LoginCredentials } from '@olivierzal/heatzy-api'
import type PairSession from 'homey/lib/PairSession'

export = class extends Driver {
  readonly #heatzyAPI = (this.homey.app as HeatzyApp).heatzyAPI

  public getRequiredCapabilities(
    productKey: string,
    productName: string,
  ): string[] {
    if (isFirstGen(productKey)) {
      return ['onoff', 'mode']
    }
    return (this.manifest as ManifestDriver).capabilities.filter(
      (capability) => {
        if (capability.startsWith('target_temperature')) {
          return isGlow(productKey)
        }
        return isFirstPilot(productName) ?
            capability !== 'mode3'
          : capability !== 'mode'
      },
    )
  }

  public override async onInit(): Promise<void> {
    this.#registerRunListeners()
    return Promise.resolve()
  }

  public override async onPair(session: PairSession): Promise<void> {
    session.setHandler('showView', async (view) => {
      if (view === 'loading') {
        if (await this.#heatzyAPI.applyLogin()) {
          await session.showView('list_devices')
          return
        }
        await session.showView('login')
      }
    })
    session.setHandler('login', async (data: LoginCredentials) =>
      this.#heatzyAPI.applyLogin(data),
    )
    session.setHandler('list_devices', async () => this.#discoverDevices())
    return Promise.resolve()
  }

  public override async onRepair(session: PairSession): Promise<void> {
    session.setHandler('login', async (data: LoginCredentials) =>
      this.#heatzyAPI.applyLogin(data),
    )
    return Promise.resolve()
  }

  async #discoverDevices(): Promise<DeviceDetails[]> {
    try {
      return (await this.#heatzyAPI.bindings()).data.devices.map(
        ({
          dev_alias: name,
          did,
          product_key: productKey,
          product_name: productName,
        }) => ({
          capabilities: this.getRequiredCapabilities(productKey, productName),
          data: { id: did, productKey, productName },
          name,
        }),
      )
    } catch (_error) {
      return []
    }
  }

  #registerDerogTimeRunListeners(): void {
    this.homey.flow
      .getConditionCard('derog_time_boost_condition')
      .registerRunListener((args: FlowArgs) =>
        Boolean(Number(args.device.getCapabilityValue('derog_time_boost'))),
      )
    this.homey.flow
      .getActionCard('derog_time_boost_action')
      .registerRunListener(async (args: FlowArgs) => {
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
        (args: FlowArgs) =>
          args.device.getCapabilityValue(capability) === args.mode,
      )
    this.homey.flow
      .getActionCard(`${capability}_action`)
      .registerRunListener(async (args: FlowArgs) => {
        await args.device.triggerCapabilityListener(capability, args.mode)
      })
  }

  #registerOnOffRunListeners(): void {
    this.homey.flow
      .getConditionCard('onoff.timer_condition')
      .registerRunListener((args: FlowArgs) =>
        args.device.getCapabilityValue('onoff.timer'),
      )
    this.homey.flow
      .getActionCard('onoff.timer_action')
      .registerRunListener(async (args: FlowArgs) => {
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
      .registerRunListener(async (args: FlowArgs) => {
        await args.device.triggerCapabilityListener(
          'target_temperature.complement',
          args.target_temperature,
        )
      })
  }
}
