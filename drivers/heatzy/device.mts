import {
  type DeviceFacadeAny,
  type PostAttributes,
  DerogationMode,
  getTargetTemperature,
  isAPIError,
  Mode,
  Product,
  Switch,
  supportsGlow,
  supportsPro,
  supportsV2,
} from '@olivierzal/heatzy-api'

import type {
  Capabilities,
  CapabilitiesOptions,
  SetCapabilities,
} from '../../types/capabilities.mts'
import type { Settings, Store } from '../../types/device-settings.mts'
import { NotFoundError } from '../../lib/errors.mts'
import { fireAndForget } from '../../lib/fire-and-forget.mts'
import { getErrorMessage } from '../../lib/get-error-message.mts'
import { type Homey, Device } from '../../lib/homey.mts'
import { sequential } from '../../lib/sequential.mts'
import type HeatzyDriver from './driver.mts'
import {
  getCapabilitiesOptions,
  getRequiredCapabilities,
  SETTABLE_CAPABILITIES,
} from './driver.mts'

const DEBOUNCE_DELAY = 1000

// The as-const constants carry no reverse mapping; the capability
// value is the key, spelled out per member so the compiler pins it.
const derogationModeKeys: Record<DerogationMode, keyof typeof DerogationMode> =
  {
    [DerogationMode.boost]: 'boost',
    [DerogationMode.off]: 'off',
    [DerogationMode.presence]: 'presence',
    [DerogationMode.vacation]: 'vacation',
  }

const modes: ReadonlySet<string> = new Set<Mode>(Object.values(Mode))

const isMode = (value: unknown): value is Mode =>
  typeof value === 'string' && modes.has(value)

const isDerogationModeKey = (
  value: unknown,
): value is keyof typeof DerogationMode =>
  typeof value === 'string' && Object.hasOwn(DerogationMode, value)

const toSwitch = (value: unknown): Switch =>
  value === true ? Switch.on : Switch.off

export default class HeatzyDevice extends Device {
  declare public readonly driver: HeatzyDriver

  declare public readonly getCapabilities: () => string[]

  declare public readonly getCapabilityValue: <TKey extends keyof Capabilities>(
    capability: TKey,
  ) => Capabilities[TKey]

  declare public readonly getData: () => { id: string }

  declare public readonly getSetting: <TKey extends keyof Settings>(
    setting: TKey,
  ) => NonNullable<Settings[TKey]>

  declare public readonly getSettings: () => Settings

  declare public readonly getStoreValue: <TKey extends keyof Store>(
    key: TKey,
  ) => Store[TKey]

  declare public readonly homey: Homey.Homey

  declare public readonly setCapabilityOptions: <
    TKey extends keyof CapabilitiesOptions,
  >(
    capability: TKey,
    options: CapabilitiesOptions[TKey] & Record<string, unknown>,
  ) => Promise<void>

  declare public readonly setCapabilityValue: <TKey extends keyof Capabilities>(
    capability: TKey,
    value: Capabilities[TKey],
  ) => Promise<void>

  declare public readonly setSettings: (settings: Settings) => Promise<void>

  declare public readonly setStoreValue: <TKey extends keyof Store>(
    key: TKey,
    value: Store[TKey],
  ) => Promise<void>

  declare public readonly triggerCapabilityListener: <
    TKey extends keyof Capabilities,
  >(
    capability: TKey,
    value: Capabilities[TKey],
  ) => Promise<void>

  public get id(): string {
    return this.getData().id
  }

  #facade?: DeviceFacadeAny

  #syncTimeout: NodeJS.Timeout | null = null

  // Wire converters per settable capability. Product-aware: Glow speaks
  // `on_off`/`LOCK_C` where every other generation speaks `mode`/
  // `lock_switch`.
  readonly #toDevice: {
    readonly [TKey in keyof SetCapabilities]: (
      value: unknown,
      product: Product,
    ) => PostAttributes
  } = {
    derog_time: (value) => ({ derog_time: Number(value) }),
    heater_operation_mode: (value) =>
      isDerogationModeKey(value) ? { derog_mode: DerogationMode[value] } : {},
    locked: (value, product) =>
      product === Product.glow ?
        { LOCK_C: toSwitch(value) }
      : { lock_switch: toSwitch(value) },
    onoff: (value, product) =>
      product === Product.glow ?
        { on_off: toSwitch(value) }
      : { mode: value === true ? this.#onValue : Mode.stop },
    'onoff.timer': (value) => ({ timer_switch: toSwitch(value) }),
    'onoff.window_detection': (value) => ({ window_switch: toSwitch(value) }),
    target_temperature: (value, product) =>
      getTargetTemperature(product, Mode.comfort, Number(value)),
    'target_temperature.eco': (value, product) =>
      getTargetTemperature(product, Mode.eco, Number(value)),
    thermostat_mode: (value) =>
      isMode(value) ?
        { mode: value === Mode.stop ? this.#offValue : value }
      : {},
  }

  get #offValue(): Mode {
    return this.getSetting('always_on') ? this.#onValue : Mode.stop
  }

  get #onValue(): Mode {
    const onMode = this.getSetting('on_mode')
    return (
      (onMode === 'previous' ? this.getStoreValue('previousMode') : onMode) ??
      Mode.eco
    )
  }

  public override async onInit(): Promise<void> {
    await this.setWarning(null)
    this.#registerCapabilityListeners()
    await this.ensureDevice()
  }

  public override async onSettings({
    changedKeys,
    newSettings,
  }: {
    changedKeys: string[]
    newSettings: Settings
  }): Promise<void> {
    if (
      changedKeys.includes('always_on') &&
      newSettings.always_on === true &&
      this.hasCapability('onoff')
    ) {
      await this.triggerCapabilityListener('onoff', true)
    }
  }

  public override onDeleted(): void {
    this.#clearSyncTimeout()
  }

  public override async onUninit(): Promise<void> {
    this.onDeleted()
    await Promise.resolve()
  }

  public override async addCapability(capability: string): Promise<void> {
    if (!this.hasCapability(capability)) {
      await super.addCapability(capability)
    }
  }

  public async ensureDevice(): Promise<DeviceFacadeAny | null> {
    try {
      return await this.#ensureFacade()
    } catch (error) {
      // Expected failures (Heatzy API, registry lookup) surface as a
      // user-visible warning; anything else is a programming error and
      // is only logged, so real bugs are not masked as device warnings.
      if (isAPIError(error) || error instanceof NotFoundError) {
        await this.setWarning(error)
      } else {
        this.error('Unexpected error while ensuring device:', error)
      }
      return null
    }
  }

  public override error(...args: unknown[]): void {
    super.error(this.getName(), '-', ...args)
  }

  public override log(...args: unknown[]): void {
    super.log(this.getName(), '-', ...args)
  }

  public override async removeCapability(capability: string): Promise<void> {
    if (this.hasCapability(capability)) {
      await super.removeCapability(capability)
    }
  }

  // Homey keeps a warning bubble on the device tile until it is cleared:
  // setting the message and clearing it right away shows the transient
  // toast without permanently flagging the device. The immediate reset
  // to `null` is intentional — do not "fix" it.
  public override async setWarning(error: unknown): Promise<void> {
    if (error !== null) {
      await super.setWarning(getErrorMessage(error))
    }
    await super.setWarning(null)
  }

  public async syncFromDevice(): Promise<void> {
    const device = await this.ensureDevice()
    if (device === null) {
      return
    }
    this.homey.api.realtime('deviceupdate', null)
    await this.#setV1CapabilityValues(device)
    await this.#setV2CapabilityValues(device)
    await this.#setGlowCapabilityValues(device)
    await this.#setProCapabilityValues(device)
    await this.setStoreValue('previousMode', device.previousMode)
  }

  #buildUpdateData(
    device: DeviceFacadeAny,
    values: Record<string, unknown>,
  ): PostAttributes {
    this.log('Requested data:', values)
    let updateData: PostAttributes = {}
    for (const capability of SETTABLE_CAPABILITIES) {
      if (!Object.hasOwn(values, capability)) {
        continue
      }

      // always_on devices never switch off from Homey: the outgoing
      // value is coerced before the converter runs.
      const value =
        capability === 'onoff' && this.getSetting('always_on') ?
          true
        : values[capability]
      updateData = {
        ...updateData,
        ...this.#toDevice[capability](value, device.product),
      }
    }
    return updateData
  }

  #clearSyncTimeout(): void {
    if (this.#syncTimeout === null) {
      return
    }

    this.homey.clearTimeout(this.#syncTimeout)
    this.#syncTimeout = null
  }

  async #ensureFacade(): Promise<DeviceFacadeAny> {
    if (this.#facade === undefined) {
      this.#facade = this.homey.app.getFacade(this.id)
      await this.#init(this.#facade)
    }
    return this.#facade
  }

  // The per-capability IPC bulk (options reapplication, value sync):
  // detached from the ready path so slow hardware never burns the
  // SDK's 30 s budget on serialized IPC. `#setCapabilities` stays
  // awaited: its post-pairing delta is usually empty and the
  // capability set must exist before the listeners fire.
  async #finishInit(device: DeviceFacadeAny): Promise<void> {
    await this.#setCapabilityOptions(device.product)
    await this.syncFromDevice()
  }

  async #init(device: DeviceFacadeAny): Promise<void> {
    await this.#setCapabilities(device.product)
    fireAndForget(
      this.#finishInit(device),
      (...args: unknown[]) => {
        this.error(...args)
      },
      'Deferred device init failed:',
    )
  }

  #registerCapabilityListeners(): void {
    this.registerMultipleCapabilityListener(
      [...SETTABLE_CAPABILITIES],
      async (values) => {
        await this.#sendUpdate(values)
      },
      DEBOUNCE_DELAY,
    )
  }

  // Delay sync to let Homey's optimistic UI update and debounce settle.
  // The handle is kept so deletion cancels a pending sync, and failures
  // are logged instead of becoming unhandled rejections.
  #scheduleSyncFromDevice(): void {
    this.#clearSyncTimeout()
    this.#syncTimeout = this.homey.setTimeout(async () => {
      this.#syncTimeout = null
      try {
        await this.syncFromDevice()
      } catch (error) {
        this.error('Post-update sync failed:', error)
      }
    }, DEBOUNCE_DELAY)
  }

  async #sendUpdate(values: Record<string, unknown>): Promise<void> {
    const device = await this.ensureDevice()
    if (device === null) {
      return
    }
    const updateData = this.#buildUpdateData(device, values)
    if (Object.keys(updateData).length > 0) {
      try {
        await device.setValues(updateData)
      } catch (error) {
        await this.setWarning(error)
      }
    }
    this.#scheduleSyncFromDevice()
  }

  async #setCapabilities(product: Product): Promise<void> {
    const currentCapabilities = new Set(this.getCapabilities())
    const requiredCapabilities = new Set(
      getRequiredCapabilities(product).filter((capability) =>
        this.driver.manifest.capabilities.includes(capability),
      ),
    )
    await sequential(
      [...currentCapabilities.symmetricDifference(requiredCapabilities)],
      async (capability) => {
        await (requiredCapabilities.has(capability) ?
          this.addCapability(capability)
        : this.removeCapability(capability))
      },
    )
  }

  async #setCapabilityOptions(product: Product): Promise<void> {
    const options = getCapabilitiesOptions(product)
    const optionCapabilities: readonly (keyof CapabilitiesOptions)[] = [
      'heater_operation_mode',
      'operational_state',
      'thermostat_mode',
    ]
    await sequential(optionCapabilities, async (capability) => {
      if (this.hasCapability(capability)) {
        await this.setCapabilityOptions(capability, options[capability])
      }
    })
  }

  async #setGlowCapabilityValues(device: DeviceFacadeAny): Promise<void> {
    if (!supportsGlow(device)) {
      return
    }

    const { comfortTemperature, currentTemperature, ecoTemperature } = device
    await this.setCapabilityValue('measure_temperature', currentTemperature)
    await this.setCapabilityValue('target_temperature', comfortTemperature)
    await this.setCapabilityValue('target_temperature.eco', ecoTemperature)
  }

  async #setProCapabilityValues(device: DeviceFacadeAny): Promise<void> {
    if (!supportsPro(device)) {
      return
    }

    const { currentHumidity, currentMode, isDetectingOpenWindow, isPresence } =
      device
    await this.setCapabilityValue('alarm_presence', isPresence)
    await this.setCapabilityValue('measure_humidity', currentHumidity)
    await this.setCapabilityValue(
      'onoff.window_detection',
      isDetectingOpenWindow,
    )
    await this.setCapabilityValue('operational_state', currentMode)
  }

  async #setV1CapabilityValues(device: DeviceFacadeAny): Promise<void> {
    const { isOn, mode } = device
    await this.setCapabilityValue('onoff', isOn)
    await this.setCapabilityValue('thermostat_mode', mode)
  }

  async #setV2CapabilityValues(device: DeviceFacadeAny): Promise<void> {
    if (!supportsV2(device)) {
      return
    }

    const {
      derogationEndString,
      derogationMode,
      derogationTime,
      isLocked,
      isTimer,
    } = device
    await this.setCapabilityValue('derog_end', derogationEndString)
    await this.setCapabilityValue(
      'heater_operation_mode',
      derogationModeKeys[derogationMode],
    )
    await this.setCapabilityValue('derog_time', String(derogationTime))
    await this.setCapabilityValue('locked', isLocked)
    await this.setCapabilityValue('onoff.timer', isTimer)
  }
}
