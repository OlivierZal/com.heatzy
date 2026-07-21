import { vi } from 'vitest'

// Options for createMockDeviceClass.
// - `overrides`: instance-level props assigned in the constructor (shallow merge).
// - `superMocks`: prototype-level methods that delegate to the provided vi.fn.
//   Required for every method HeatzyDevice overrides with a super call
//   (addCapability, removeCapability, setWarning, error, log) — instance
//   vi.fn properties cannot be reached through super in a subclass.
export interface MockDeviceClassOptions {
  readonly overrides?: Readonly<Record<string, unknown>>
  readonly superMocks?: Readonly<
    Record<string, (...args: readonly unknown[]) => unknown>
  >
}

export const createMockDeviceClass = (
  options: MockDeviceClassOptions = {},
): new () => Record<string, unknown> => {
  const { overrides, superMocks = {} } = options

  class MockDevice {
    public driver: Record<string, unknown> = {}

    public getCapabilities = vi.fn<() => string[]>().mockReturnValue([])

    public getCapabilityValue = vi.fn<(capability: string) => unknown>()

    public getData = vi
      .fn<() => { id: string }>()
      .mockReturnValue({ id: 'device-1' })

    public getName = vi.fn<() => string>().mockReturnValue('Test device')

    public getSetting = vi.fn<(key: string) => unknown>()

    public getSettings = vi
      .fn<() => Record<string, unknown>>()
      .mockReturnValue({})

    public getStoreValue = vi.fn<(key: string) => unknown>()

    public hasCapability = vi
      .fn<(capability: string) => boolean>()
      .mockReturnValue(true)

    public homey: Record<string, unknown> = {}

    public registerMultipleCapabilityListener =
      vi.fn<
        (
          capabilities: readonly string[],
          listener: (values: Record<string, unknown>) => Promise<void>,
          delay?: number,
        ) => void
      >()

    public setCapabilityOptions =
      vi.fn<
        (capability: string, options: Record<string, unknown>) => Promise<void>
      >()

    public setCapabilityValue =
      vi.fn<(capability: string, value: unknown) => Promise<void>>()

    public setSettings =
      vi.fn<(settings: Record<string, unknown>) => Promise<void>>()

    public setStoreValue =
      vi.fn<(key: string, value: unknown) => Promise<void>>()

    public triggerCapabilityListener =
      vi.fn<(capability: string, value: unknown) => Promise<void>>()

    public constructor() {
      if (overrides !== undefined) {
        Object.assign(this, overrides)
      }
    }
  }

  for (const [methodName, mockFunction] of Object.entries(superMocks)) {
    Object.defineProperty(MockDevice.prototype, methodName, {
      configurable: true,
      writable: true,
      value: (...args: readonly unknown[]): unknown => mockFunction(...args),
    })
  }

  return MockDevice as unknown as new () => Record<string, unknown>
}
