import type { DriverSetting } from '@olivierzal/homey-kit/manifest'
import type { Homey } from 'homey/lib/Homey'
import {
  type LoginCredentials,
  AuthenticationError,
  RegistrySyncError,
} from '@olivierzal/heatzy-api'
import { mock } from '@olivierzal/homey-kit/testing'
import { describe, expect, it, vi } from 'vitest'

import type { DeviceSettings, Settings } from '../../types/device-settings.mts'

const { default: api } = await import('../../api.mts')

const mockAuthenticate = vi.fn<(body: LoginCredentials) => Promise<void>>()
const mockIsAccountEmpty = vi.fn<() => boolean>().mockReturnValue(false)
const mockIsAuthenticated = vi.fn<() => boolean>()
const mockIsPairingPending = vi.fn<() => boolean>().mockReturnValue(false)
const mockLogOut = vi.fn<() => void>()

const mockApp = {
  api: {
    authenticate: mockAuthenticate,
    isAuthenticated: mockIsAuthenticated,
    logOut: mockLogOut,
  },
  error: vi.fn<(...args: readonly unknown[]) => void>(),
  getDeviceSettings: vi.fn<() => DeviceSettings>(),
  getDriverSettings: vi.fn<() => Partial<Record<string, DriverSetting[]>>>(),
  isAccountEmpty: mockIsAccountEmpty,
  isPairingPending: mockIsPairingPending,
  log: vi.fn<(...args: readonly unknown[]) => void>(),
  updateDeviceSettings: vi.fn<(settings: Settings) => Promise<void>>(),
}

const mockI18n = { getLanguage: vi.fn<() => string>() }

const mockTranslate = vi.fn<(key: string) => string>((key) => key)

const homey = mock<Homey>({ __: mockTranslate, app: mockApp, i18n: mockI18n })

const SETTINGS_PAGE = 'Settings page'

describe('api', () => {
  describe('authentication', () => {
    it('should delegate to app.api.authenticate and log the breadcrumb', async () => {
      const credentials = mock<LoginCredentials>({
        password: 'pass',
        username: 'user',
      })
      mockAuthenticate.mockResolvedValue()

      const result = await api.authenticate({ body: credentials, homey })

      expect(result).toStrictEqual({
        isAccountEmpty: false,
        isDeviceListStale: false,
        isPairingPending: false,
      })
      expect(mockAuthenticate).toHaveBeenCalledWith(credentials)
      expect(mockApp.log).toHaveBeenCalledWith({
        dataType: SETTINGS_PAGE,
        route: 'POST /sessions',
      })
    })

    // The sign-in awaited its enforced sync, so the registry answers for
    // the account: one listing radiators none of which is paired says so.
    it('should report a pending pairing once signed in', async () => {
      mockAuthenticate.mockResolvedValue()
      mockIsPairingPending.mockReturnValueOnce(true)

      await expect(
        api.authenticate({ body: mock<LoginCredentials>(), homey }),
      ).resolves.toStrictEqual({
        isAccountEmpty: false,
        isDeviceListStale: false,
        isPairingPending: true,
      })
    })

    // The account itself answered that it lists nothing: said at the
    // sign-in, where a pairing wizard could offer nothing.
    it('should report an empty account once signed in', async () => {
      mockAuthenticate.mockResolvedValue()
      mockIsAccountEmpty.mockReturnValueOnce(true)

      await expect(
        api.authenticate({ body: mock<LoginCredentials>(), homey }),
      ).resolves.toStrictEqual({
        isAccountEmpty: true,
        isDeviceListStale: false,
        isPairingPending: false,
      })
    })
  })

  describe('login failure classification', () => {
    it('translates a credential rejection into its localized reason', async () => {
      mockAuthenticate.mockRejectedValueOnce(
        new AuthenticationError('Heatzy rejected the credentials'),
      )

      await expect(
        api.authenticate({ body: mock<LoginCredentials>(), homey }),
      ).rejects.toThrow('settings.authenticate.rejected')
      expect(mockTranslate).toHaveBeenCalledWith(
        'settings.authenticate.rejected',
      )
      expect(mockApp.log).toHaveBeenCalledWith({
        dataType: SETTINGS_PAGE,
        route: 'POST /sessions',
      })
    })

    it('passes a transport failure message through untranslated', async () => {
      mockAuthenticate.mockRejectedValueOnce(new Error('transport down'))

      await expect(
        api.authenticate({ body: mock<LoginCredentials>(), homey }),
      ).rejects.toThrow('transport down')
      expect(mockTranslate).not.toHaveBeenCalled()
    })
  })

  // The library enforces a registry sync AFTER the server accepted the
  // credentials and wraps that failure as `RegistrySyncError`: the TYPE
  // is the arbiter, and such a rejection reports a stale device list,
  // never a login failure. The session is never consulted — it reads
  // "signed in" on a transport failure over a pre-existing live one.
  describe('accepted sign-in whose registry sync failed', () => {
    it('should answer a stale device list rather than reject', async () => {
      mockAuthenticate.mockRejectedValueOnce(
        new RegistrySyncError(
          'Signed in, but the registry could not be verified',
          { cause: new Error('registry sync down') },
        ),
      )

      await expect(
        api.authenticate({ body: mock<LoginCredentials>(), homey }),
      ).resolves.toStrictEqual({
        isAccountEmpty: false,
        isDeviceListStale: true,
        isPairingPending: false,
      })
      expect(mockTranslate).not.toHaveBeenCalled()
      // A list that could not be refreshed is judged neither empty nor
      // pending.
      expect(mockIsAccountEmpty).not.toHaveBeenCalled()
      expect(mockIsPairingPending).not.toHaveBeenCalled()
      expect(mockApp.log).toHaveBeenCalledWith({
        dataType: SETTINGS_PAGE,
        route: 'POST /sessions',
      })
    })

    // The retired heuristic's confirmed false positive: a transport
    // failure during the sign-in round-trip over a PRE-EXISTING live
    // session read "signed in, stale list" while the new credentials
    // were never accepted. It is a LOGIN FAILURE, and the session is
    // never consulted.
    it('should report a login failure on a transport failure over a pre-existing live session', async () => {
      mockAuthenticate.mockRejectedValueOnce(new Error('transport down'))
      mockIsAuthenticated.mockReturnValue(true)

      await expect(
        api.authenticate({ body: mock<LoginCredentials>(), homey }),
      ).rejects.toThrow('transport down')
      expect(mockIsAuthenticated).not.toHaveBeenCalled()
    })

    it('should never rescue a credential rejection over a live session', async () => {
      mockAuthenticate.mockRejectedValueOnce(
        new AuthenticationError('Heatzy rejected the credentials'),
      )
      mockIsAuthenticated.mockReturnValue(true)

      await expect(
        api.authenticate({ body: mock<LoginCredentials>(), homey }),
      ).rejects.toThrow('settings.authenticate.rejected')
      expect(mockIsAuthenticated).not.toHaveBeenCalled()
    })
  })

  describe('device settings retrieval', () => {
    it('should delegate to app.getDeviceSettings and log the breadcrumb', () => {
      const deviceSettings = mock<DeviceSettings>()
      mockApp.getDeviceSettings.mockReturnValue(deviceSettings)

      const result = api.getDeviceSettings({ homey })

      expect(result).toBe(deviceSettings)
      expect(mockApp.getDeviceSettings).toHaveBeenCalledTimes(1)
      expect(mockApp.log).toHaveBeenCalledWith({
        dataType: SETTINGS_PAGE,
        route: 'GET /settings/devices',
      })
    })
  })

  describe('driver settings retrieval', () => {
    it('should delegate to app.getDriverSettings and log the breadcrumb', () => {
      const driverSettings = mock<Partial<Record<string, DriverSetting[]>>>()
      mockApp.getDriverSettings.mockReturnValue(driverSettings)

      const result = api.getDriverSettings({ homey })

      expect(result).toBe(driverSettings)
      expect(mockApp.getDriverSettings).toHaveBeenCalledTimes(1)
      expect(mockApp.log).toHaveBeenCalledWith({
        dataType: SETTINGS_PAGE,
        route: 'GET /settings/drivers',
      })
    })
  })

  describe('language retrieval', () => {
    it.each(['en', 'fr'])(
      'should return %s from i18n and log the breadcrumb',
      (language) => {
        mockI18n.getLanguage.mockReturnValue(language)

        const result = api.getLanguage({ homey })

        expect(result).toBe(language)
        expect(mockI18n.getLanguage).toHaveBeenCalledTimes(1)
        expect(mockApp.log).toHaveBeenCalledWith({
          dataType: SETTINGS_PAGE,
          route: 'GET /language',
        })
      },
    )
  })

  describe('session retrieval', () => {
    it.each([true, false])(
      'should return %s from app.api.isAuthenticated and log the breadcrumb',
      (isExpected) => {
        mockIsAuthenticated.mockReturnValue(isExpected)

        const isAuthenticated = api.isAuthenticated({ homey })

        expect(isAuthenticated).toBe(isExpected)
        expect(mockIsAuthenticated).toHaveBeenCalledTimes(1)
        expect(mockApp.log).toHaveBeenCalledWith({
          dataType: SETTINGS_PAGE,
          route: 'GET /sessions',
        })
      },
    )
  })

  describe('account-emptiness retrieval', () => {
    it.each([true, false])(
      'should return %s from app.isAccountEmpty and log the breadcrumb',
      (isExpected) => {
        mockIsAccountEmpty.mockReturnValueOnce(isExpected)

        expect(api.isAccountEmpty({ homey })).toBe(isExpected)
        expect(mockIsAccountEmpty).toHaveBeenCalledTimes(1)
        expect(mockApp.log).toHaveBeenCalledWith({
          dataType: SETTINGS_PAGE,
          route: 'GET /sessions/empty',
        })
      },
    )
  })

  describe('pairing-pending retrieval', () => {
    it.each([true, false])(
      'should return %s from app.isPairingPending and log the breadcrumb',
      (isExpected) => {
        mockIsPairingPending.mockReturnValueOnce(isExpected)

        expect(api.isPairingPending({ homey })).toBe(isExpected)
        expect(mockIsPairingPending).toHaveBeenCalledTimes(1)
        expect(mockApp.log).toHaveBeenCalledWith({
          dataType: SETTINGS_PAGE,
          route: 'GET /devices/pending',
        })
      },
    )
  })

  describe('logout', () => {
    it('should delegate to app.api.logOut and log the breadcrumb', () => {
      api.logOut({ homey })

      expect(mockLogOut).toHaveBeenCalledTimes(1)
      expect(mockApp.log).toHaveBeenCalledWith({
        dataType: SETTINGS_PAGE,
        route: 'DELETE /sessions',
      })
    })
  })

  describe('device settings update', () => {
    it('should delegate to app.updateDeviceSettings and log the breadcrumb', async () => {
      const body = mock<Settings>({ always_on: true })
      mockApp.updateDeviceSettings.mockResolvedValue()

      await api.updateDeviceSettings({ body, homey })

      expect(mockApp.updateDeviceSettings).toHaveBeenCalledWith(body)
      expect(mockApp.log).toHaveBeenCalledWith({
        dataType: SETTINGS_PAGE,
        route: 'PUT /settings/devices',
      })
    })
  })

  describe('webview boot logging', () => {
    it('should log the boot failure body via app.error without a breadcrumb', () => {
      const body = { message: 'boom' }

      api.logWebviewBoot({ body, homey })

      expect(mockApp.error).toHaveBeenCalledWith(
        'Settings webview boot failure:',
        body,
      )
      expect(mockApp.log).not.toHaveBeenCalled()
    })
  })

  describe('webview hashes', () => {
    it('should log a breadcrumb and serve the packaged manifest map', async () => {
      // A dev suite run packages no manifest: the empty map is the
      // documented fresh-by-default answer.
      await expect(api.getWebviewHashes({ homey })).resolves.toStrictEqual({})

      expect(mockApp.log).toHaveBeenCalledWith({
        dataType: 'Settings page',
        route: 'GET /webview-hashes',
      })
    })
  })
})
