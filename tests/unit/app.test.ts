import type * as HeatzyApiModule from '@olivierzal/heatzy-api'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type HeatzyDevice from '../../drivers/heatzy/device.mts'
import type * as FilesModule from '../../files.mts'
import type * as HomeyLib from '../../lib/homey.mts'
import type { Settings } from '../../types/device-settings.mts'
import type { LoginSetting, ManifestDriver } from '../../types/manifest.mts'
import {
  assertDefined,
  getMockCallArg,
  mock,
  settleDetached,
} from '../helpers.ts'

const { mockCreate, mockFacadeManagerConstructor } = vi.hoisted(() => ({
  mockCreate: vi.fn<(options: unknown) => Promise<unknown>>(),
  mockFacadeManagerConstructor: vi.fn<(...args: unknown[]) => unknown>(),
}))

vi.mock(import('@olivierzal/heatzy-api'), async (importOriginal) => {
  const { mock: mockModule } = await import('../helpers.ts')
  return mockModule<typeof HeatzyApiModule>({
    ...(await importOriginal()),
    FacadeManager: mockFacadeManagerConstructor,
    HeatzyAPI: { create: mockCreate },
  })
})

vi.mock(import('../../lib/homey.mts'), async () => {
  const { mock: mockModule } = await import('../helpers.ts')
  return mockModule<typeof HomeyLib>({ App: Function })
})

vi.mock(import('../../files.mts'), async (importOriginal) => {
  const { mock: mockModule } = await import('../helpers.ts')
  const original = await importOriginal()
  return mockModule<typeof FilesModule>({
    ...original,
    changelog: {
      ...original.changelog,
      '1.0.0': { en: 'English changelog', fr: 'French changelog' },
    },
  })
})

const { default: HeatzyApp } = await import('../../app.mts')

const heatzyLoginPair: LoginSetting = {
  id: 'login',
  options: {
    passwordLabel: { en: 'Password', fr: 'Mot de passe' },
    usernameLabel: { en: 'Username', fr: 'Nom' },
    usernamePlaceholder: 'name@example.com',
  },
}

const mockManifestDrivers: ManifestDriver[] = [
  {
    capabilities: [],
    id: 'heatzy',
    name: { en: 'Heatzy', fr: 'Heatzy' },
    pair: [heatzyLoginPair],
    settings: [
      {
        children: [
          {
            id: 'setting1',
            label: { en: 'Setting 1', fr: 'Réglage 1' },
            type: 'checkbox',
          },
          {
            id: 'mode',
            label: { en: 'Mode' },
            type: 'dropdown',
            values: [
              { id: 'comfort', label: { en: 'Comfort', fr: 'Confort' } },
              { id: 'eco', label: { en: 'Eco' } },
            ],
          },
        ],
        id: 'group1',
        label: { en: 'Group 1', fr: 'Groupe 1' },
      },
    ],
  },
  {
    capabilities: [],
    id: 'odd',
    name: { en: 'Odd' },
    settings: [
      {
        children: [
          {
            id: 'orphan',
            label: { en: 'Orphan' },
            type: 'dropdown',
            values: [{ id: 'first', label: { en: 'First' } }],
          },
        ],
        label: { en: 'No group id' },
      },
      { id: 'group2', label: { en: 'Childless' } },
    ],
  },
  { capabilities: [], id: 'no-settings', name: { en: 'No settings' } },
  {
    capabilities: [],
    id: 'pair-no-login',
    name: { en: 'Pair no login' },
    pair: [{ id: 'other' }],
  },
]

const mockFacadeManagerGet = vi.fn<(instance: unknown) => unknown>()

const mockApiInstance = {
  clearSync: vi.fn<() => void>(),
  registry: {
    devices: {
      getById: vi.fn<(id: string) => unknown>(),
    },
  },
}

const mockCreateNotification = vi.fn<() => Promise<void>>()
const mockGetDrivers = vi.fn<() => Record<string, unknown>>()
const mockGetLanguage = vi.fn<() => string>()
const mockGetTimezone = vi.fn<() => string>()
const mockHomeyReady = vi.fn<() => Promise<void>>()
const mockSettingsGet = vi.fn<(key: string) => unknown>()
const mockSettingsSet = vi.fn<(key: string, value: string) => void>()
const mockSettingsUnset = vi.fn<(key: string) => void>()
const mockSetTimeout =
  vi.fn<(callback: () => Promise<void> | void, ms: number) => void>()
const mockTranslate = vi.fn<(key: string) => string>()

// `new`-able (arrows are not constructible): vitest instantiates the
// implementation when the mocked FacadeManager class is constructed.
const newMockFacadeManager = function newMockFacadeManager(): {
  get: typeof mockFacadeManagerGet
} {
  return { get: mockFacadeManagerGet }
}

const createApp = (): InstanceType<typeof HeatzyApp> => {
  const app = new HeatzyApp()
  Object.defineProperties(app, {
    error: {
      configurable: true,
      value: vi.fn<(...args: unknown[]) => void>(),
    },
    homey: {
      configurable: true,
      value: {
        __: mockTranslate,
        clock: { getTimezone: mockGetTimezone },
        drivers: { getDrivers: mockGetDrivers },
        i18n: { getLanguage: mockGetLanguage },
        manifest: { drivers: mockManifestDrivers, version: '1.0.0' },
        notifications: { createNotification: mockCreateNotification },
        ready: mockHomeyReady,
        setTimeout: mockSetTimeout,
        settings: {
          get: mockSettingsGet,
          set: mockSettingsSet,
          unset: mockSettingsUnset,
        },
      },
      writable: false,
    },
    log: {
      configurable: true,
      value: vi.fn<(...args: unknown[]) => void>(),
    },
  })
  return app
}

const createDevice = (
  overrides: Partial<Record<keyof HeatzyDevice, unknown>> = {},
): HeatzyDevice =>
  mock<HeatzyDevice>({
    driver: { id: 'heatzy' },
    getSettings: vi.fn<() => Record<string, unknown>>().mockReturnValue({}),
    ...overrides,
  })

const setupDrivers = (devices: readonly HeatzyDevice[]): void => {
  mockGetDrivers.mockReturnValue({
    heatzy: {
      getDevices: vi
        .fn<() => readonly HeatzyDevice[]>()
        .mockReturnValue(devices),
    },
  })
}

interface CreateEvents {
  onSyncComplete: HeatzyApiModule.SyncCallback
  onAuthenticationLost?: () => void
  onAuthenticationRestored?: () => void
}

const getEvents = (): CreateEvents =>
  getMockCallArg<{ events: CreateEvents }>(mockCreate, 0, 0).events

const runScheduledTimeout = async (index: number): Promise<void> => {
  await getMockCallArg<() => Promise<void>>(mockSetTimeout, index, 0)()
}

describe(HeatzyApp, () => {
  let app: InstanceType<typeof HeatzyApp>

  beforeEach(() => {
    vi.clearAllMocks()
    mockCreate.mockResolvedValue(mockApiInstance)
    mockFacadeManagerConstructor.mockImplementation(newMockFacadeManager)
    mockCreateNotification.mockResolvedValue()
    mockHomeyReady.mockResolvedValue()
    mockGetDrivers.mockReturnValue({})
    mockGetLanguage.mockReturnValue('en')
    mockGetTimezone.mockReturnValue('Europe/Paris')
    mockSettingsGet.mockReturnValue(null)
    mockTranslate.mockImplementation((key) => key)
    app = createApp()
  })

  describe('on init', () => {
    it('should create the API client with the resolved configuration', async () => {
      await app.onInit()

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          abortSignal: expect.any(AbortSignal),
          events: expect.objectContaining({
            onAuthenticationLost: expect.any(Function),
            onAuthenticationRestored: expect.any(Function),
            onSyncComplete: expect.any(Function),
          }),
          locale: 'en',
          logger: expect.objectContaining({
            error: expect.any(Function),
            log: expect.any(Function),
          }),
          settingManager: expect.objectContaining({
            get: expect.any(Function),
            set: expect.any(Function),
            unset: expect.any(Function),
          }),
          shouldResumeSessionInBackground: true,
          timezone: 'Europe/Paris',
        }),
      )
    })

    it('should clear the stale expiry marker at boot', async () => {
      await app.onInit()

      expect(mockSettingsUnset).toHaveBeenCalledWith('expireAt')
    })

    it('should construct the facade manager with the API client', async () => {
      await app.onInit()

      expect(mockFacadeManagerConstructor).toHaveBeenCalledTimes(1)
      expect(mockFacadeManagerConstructor).toHaveBeenCalledWith(mockApiInstance)
    })

    it('should expose the API client through the api getter', async () => {
      await app.onInit()

      expect(app.api).toBe(mockApiInstance)
    })

    it('should route logger callbacks to app log and error', async () => {
      await app.onInit()
      const { logger } = getMockCallArg<{ logger: HeatzyApiModule.Logger }>(
        mockCreate,
        0,
        0,
      )
      logger.log('sync log')
      logger.error('sync error')

      expect(app.log).toHaveBeenCalledWith('sync log')
      expect(app.error).toHaveBeenCalledWith('sync error')
    })

    it('should expose a setting manager mirroring homey settings', async () => {
      await app.onInit()
      const { settingManager } = getMockCallArg<{
        settingManager: HeatzyApiModule.SettingManager
      }>(mockCreate, 0, 0)
      mockSettingsGet.mockReturnValueOnce('stored')
      mockSettingsGet.mockReturnValueOnce(null)
      mockSettingsGet.mockReturnValueOnce(42)
      const stringValue = settingManager.get('username')
      const nullValue = settingManager.get('cleared')
      const legacyValue = settingManager.get('legacy')
      settingManager.set('username', 'a@b.co')
      settingManager.unset?.('token')

      expect(stringValue).toBe('stored')
      expect(nullValue).toBeNull()
      expect(legacyValue).toBeUndefined()
      expect(mockSettingsSet).toHaveBeenCalledWith('username', 'a@b.co')
      expect(mockSettingsUnset).toHaveBeenCalledWith('token')
    })

    it('should log the boot marks around init and readiness', async () => {
      await app.onInit()
      await settleDetached()

      expect(app.log).toHaveBeenCalledWith(
        'Boot: onInit after',
        expect.any(String),
        's',
      )
      expect(app.log).toHaveBeenCalledWith(
        'Boot: ready after',
        expect.any(String),
        's',
      )
    })

    it('should log a boot readiness tracking failure', async () => {
      mockHomeyReady.mockRejectedValueOnce(new Error('never ready'))
      await app.onInit()
      await settleDetached()

      expect(app.error).toHaveBeenCalledWith(
        'Boot readiness tracking failed:',
        expect.any(Error),
      )
    })

    it('should schedule a changelog notification when the stored version differs', async () => {
      await app.onInit()

      expect(mockSetTimeout).toHaveBeenCalledTimes(1)
    })

    it('should skip the notification when the stored version matches', async () => {
      mockSettingsGet.mockReturnValue('1.0.0')
      await app.onInit()

      expect(mockSetTimeout).not.toHaveBeenCalled()
    })

    it('should skip the notification when the language is absent from the changelog', async () => {
      mockGetLanguage.mockReturnValue('ja')
      await app.onInit()

      expect(mockSetTimeout).not.toHaveBeenCalled()
    })

    it('should skip the notification when the version is absent from the changelog', async () => {
      Object.defineProperty(app.homey, 'manifest', {
        configurable: true,
        value: { drivers: mockManifestDrivers, version: '9.9.9' },
      })
      await app.onInit()

      expect(mockSetTimeout).not.toHaveBeenCalled()
    })

    it('should show the changelog notification and record the version', async () => {
      await app.onInit()

      await runScheduledTimeout(0)

      expect(mockCreateNotification).toHaveBeenCalledWith({
        excerpt: 'English changelog',
      })
      expect(mockSettingsSet).toHaveBeenCalledWith('notifiedVersion', '1.0.0')
    })

    it('should swallow a failed changelog notification', async () => {
      mockCreateNotification.mockRejectedValueOnce(new Error('fail'))
      await app.onInit()

      await expect(runScheduledTimeout(0)).resolves.toBeUndefined()
      expect(mockSettingsSet).not.toHaveBeenCalled()
    })
  })

  describe('on uninit', () => {
    it('should clear the API sync', async () => {
      await app.onInit()
      await app.onUninit()

      expect(mockApiInstance.clearSync).toHaveBeenCalledTimes(1)
    })

    it('should abort the shared shutdown signal', async () => {
      await app.onInit()
      const { abortSignal } = getMockCallArg<{ abortSignal: AbortSignal }>(
        mockCreate,
        0,
        0,
      )

      expect(abortSignal.aborted).toBe(false)

      await app.onUninit()

      expect(abortSignal.aborted).toBe(true)
    })
  })

  describe('session loss lifecycle', () => {
    it('should turn a lost session into a Homey notification', async () => {
      setupDrivers([createDevice()])
      await app.onInit()

      getEvents().onAuthenticationLost?.()
      await runScheduledTimeout(-1)

      expect(mockCreateNotification).toHaveBeenCalledWith({
        excerpt: 'notifications.sessionExpired',
      })
    })

    it('should only log a lost session when no device is paired', async () => {
      await app.onInit()

      getEvents().onAuthenticationLost?.()
      await runScheduledTimeout(-1)

      expect(mockCreateNotification).not.toHaveBeenCalled()
      expect(app.log).toHaveBeenCalledWith(
        'Session lost ignored: no paired device',
      )
    })

    it('should mirror a shown loss with a signed-in-again notification', async () => {
      setupDrivers([createDevice()])
      await app.onInit()

      getEvents().onAuthenticationLost?.()
      await runScheduledTimeout(-1)
      getEvents().onAuthenticationRestored?.()
      await runScheduledTimeout(-1)

      expect(mockCreateNotification).toHaveBeenLastCalledWith({
        excerpt: 'notifications.sessionRestored',
      })
    })

    it('should stay silent on a recovery when no loss was notified', async () => {
      setupDrivers([createDevice()])
      await app.onInit()
      const scheduledCount = mockSetTimeout.mock.calls.length

      getEvents().onAuthenticationRestored?.()

      expect(mockSetTimeout).toHaveBeenCalledTimes(scheduledCount)
      expect(mockCreateNotification).not.toHaveBeenCalled()
    })

    it('should keep a recovery silent when the loss was gated off', async () => {
      await app.onInit()

      getEvents().onAuthenticationLost?.()
      await runScheduledTimeout(-1)
      const scheduledCount = mockSetTimeout.mock.calls.length
      getEvents().onAuthenticationRestored?.()

      expect(mockSetTimeout).toHaveBeenCalledTimes(scheduledCount)
      expect(mockCreateNotification).not.toHaveBeenCalled()
    })

    it('should drop both notifications when a recovery outruns the parked loss handler', async () => {
      setupDrivers([createDevice()])
      await app.onInit()

      getEvents().onAuthenticationLost?.()
      getEvents().onAuthenticationRestored?.()
      const scheduledCount = mockSetTimeout.mock.calls.length
      await runScheduledTimeout(-1)

      expect(mockSetTimeout).toHaveBeenCalledTimes(scheduledCount)
      expect(mockCreateNotification).not.toHaveBeenCalled()
    })

    it('should keep a recovery silent when the loss notification failed to display', async () => {
      setupDrivers([createDevice()])
      await app.onInit()
      mockCreateNotification.mockRejectedValueOnce(new Error('fail'))

      getEvents().onAuthenticationLost?.()
      await runScheduledTimeout(-1)
      const scheduledCount = mockSetTimeout.mock.calls.length
      getEvents().onAuthenticationRestored?.()

      expect(mockSetTimeout).toHaveBeenCalledTimes(scheduledCount)
      expect(mockCreateNotification).toHaveBeenCalledTimes(1)
    })

    it('should not resurrect an episode when a recovery lands during the loss notification', async () => {
      setupDrivers([createDevice()])
      await app.onInit()
      mockCreateNotification.mockImplementationOnce(async () => {
        getEvents().onAuthenticationRestored?.()
        await Promise.resolve()
      })

      getEvents().onAuthenticationLost?.()
      await runScheduledTimeout(-1)
      const scheduledCount = mockSetTimeout.mock.calls.length
      getEvents().onAuthenticationRestored?.()

      expect(mockSetTimeout).toHaveBeenCalledTimes(scheduledCount)
      expect(mockCreateNotification).toHaveBeenCalledTimes(1)
    })

    it('should swallow a failed signed-in-again notification', async () => {
      setupDrivers([createDevice()])
      await app.onInit()

      getEvents().onAuthenticationLost?.()
      await runScheduledTimeout(-1)
      mockCreateNotification.mockRejectedValueOnce(new Error('fail'))
      getEvents().onAuthenticationRestored?.()

      await expect(runScheduledTimeout(-1)).resolves.toBeUndefined()
    })
  })

  describe('device synchronization', () => {
    it('should sync every device when no ids are given', async () => {
      const syncFromDevice = vi.fn<() => Promise<void>>().mockResolvedValue()
      setupDrivers([createDevice({ id: '1', syncFromDevice })])
      await app.onInit()

      await getEvents().onSyncComplete()

      expect(syncFromDevice).toHaveBeenCalledTimes(1)
    })

    it('should sync only the devices matching the given ids', async () => {
      const targetSync = vi.fn<() => Promise<void>>().mockResolvedValue()
      const otherSync = vi.fn<() => Promise<void>>().mockResolvedValue()
      setupDrivers([
        createDevice({ id: '1', syncFromDevice: targetSync }),
        createDevice({ id: '2', syncFromDevice: otherSync }),
      ])
      await app.onInit()

      await getEvents().onSyncComplete({ ids: ['1'] })

      expect(targetSync).toHaveBeenCalledTimes(1)
      expect(otherSync).not.toHaveBeenCalled()
    })

    it('should log a failed device sync without aborting the others', async () => {
      const failingSync = vi
        .fn<() => Promise<void>>()
        .mockRejectedValue(new Error('sync failed'))
      const healthySync = vi.fn<() => Promise<void>>().mockResolvedValue()
      setupDrivers([
        createDevice({ id: '1', syncFromDevice: failingSync }),
        createDevice({ id: '2', syncFromDevice: healthySync }),
      ])
      await app.onInit()

      await getEvents().onSyncComplete()

      expect(healthySync).toHaveBeenCalledTimes(1)
      expect(app.error).toHaveBeenCalledWith(
        'Device sync failed:',
        expect.any(Error),
      )
    })
  })

  describe('device settings retrieval', () => {
    it('should aggregate identical settings and null out divergent ones', async () => {
      setupDrivers([
        createDevice({
          getSettings: vi
            .fn<() => Record<string, unknown>>()
            .mockReturnValue({ always_on: true, on_mode: 'comfort' }),
        }),
        createDevice({
          getSettings: vi
            .fn<() => Record<string, unknown>>()
            .mockReturnValue({ always_on: true, on_mode: 'eco' }),
        }),
      ])
      await app.onInit()

      const deviceSettings = app.getDeviceSettings()

      expect(deviceSettings.heatzy?.always_on).toBe(true)
      expect(deviceSettings.heatzy?.on_mode).toBeNull()
    })
  })

  describe('driver settings retrieval', () => {
    it('should group settings by group id and login, falling back to english', async () => {
      await app.onInit()

      const driverSettings = app.getDriverSettings()

      expect(driverSettings.group1).toBeInstanceOf(Array)
      expect(driverSettings.login).toHaveLength(2)
      expect(driverSettings.odd?.[0]?.id).toBe('orphan')
      expect(driverSettings.odd?.[0]?.groupLabel).toBe('No group id')
    })

    it('should localize driver settings, falling back to english', async () => {
      await app.onInit()
      mockGetLanguage.mockReturnValue('fr')

      const { group1 } = app.getDriverSettings()
      assertDefined(group1)
      const [setting1, modeSetting] = group1
      assertDefined(setting1)
      assertDefined(modeSetting)
      const { values } = modeSetting
      assertDefined(values)

      expect(setting1.title).toBe('Réglage 1')
      expect(setting1.groupLabel).toBe('Groupe 1')
      expect(modeSetting.title).toBe('Mode')
      expect(values[1]?.label).toBe('Eco')
    })

    it('should localize login settings, falling back to english', async () => {
      await app.onInit()
      mockGetLanguage.mockReturnValue('fr')

      const { login } = app.getDriverSettings()
      assertDefined(login)
      const [password, username] = login
      assertDefined(password)
      assertDefined(username)

      expect(password.title).toBe('Mot de passe')
      // No password placeholder; the username placeholder is a single
      // ASCII example, returned as-is by localize regardless of language.
      expect(password.placeholder).toBeUndefined()
      expect(username.title).toBe('Nom')
      expect(username.placeholder).toBe('name@example.com')
    })
  })

  describe('facade retrieval', () => {
    it('should resolve a facade for a known device id', async () => {
      const instance = { id: 'device-1' }
      const facade = mock<HeatzyApiModule.DeviceFacadeAny>()
      mockApiInstance.registry.devices.getById.mockReturnValue(instance)
      mockFacadeManagerGet.mockReturnValue(facade)
      await app.onInit()

      const result = app.getFacade('device-1')

      expect(result).toBe(facade)
      expect(mockApiInstance.registry.devices.getById).toHaveBeenCalledWith(
        'device-1',
      )
      expect(mockFacadeManagerGet).toHaveBeenCalledWith(instance)
    })

    it('should throw a not-found error for an unknown device id', async () => {
      mockApiInstance.registry.devices.getById.mockReturnValue(undefined)
      await app.onInit()

      expect(() => app.getFacade('missing')).toThrow('errors.deviceNotFound')
      expect(mockTranslate).toHaveBeenCalledWith('errors.deviceNotFound')
    })
  })

  describe('device settings update', () => {
    it('should push only the changed settings and run onSettings', async () => {
      const setSettings = vi
        .fn<(settings: Settings) => Promise<void>>()
        .mockResolvedValue()
      const onSettings = vi.fn<() => Promise<void>>().mockResolvedValue()
      setupDrivers([
        createDevice({
          getSetting: vi.fn<(key: string) => unknown>().mockReturnValue(false),
          getSettings: vi
            .fn<() => Record<string, unknown>>()
            .mockReturnValue({ always_on: true }),
          onSettings,
          setSettings,
        }),
      ])
      await app.onInit()

      await app.setDeviceSettings(mock<Settings>({ always_on: true }))

      expect(setSettings).toHaveBeenCalledWith({ always_on: true })
      expect(onSettings).toHaveBeenCalledTimes(1)
    })

    it('should skip a device with no changed keys', async () => {
      const setSettings = vi.fn<(settings: Settings) => Promise<void>>()
      setupDrivers([
        createDevice({
          getSetting: vi.fn<(key: string) => unknown>().mockReturnValue(true),
          getSettings: vi
            .fn<() => Record<string, unknown>>()
            .mockReturnValue({ always_on: true }),
          setSettings,
        }),
      ])
      await app.onInit()

      await app.setDeviceSettings(mock<Settings>({ always_on: true }))

      expect(setSettings).not.toHaveBeenCalled()
    })
  })
})
