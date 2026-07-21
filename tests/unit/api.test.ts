import type { Homey } from 'homey/lib/Homey'
import {
  type LoginCredentials,
  AuthenticationError,
} from '@olivierzal/heatzy-api'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { DeviceSettings, Settings } from '../../types/device-settings.mts'
import type { DriverSetting } from '../../types/driver-settings.mts'
import { mock } from '../helpers.js'

const { default: api } = await import('../../api.mts')

const mockAuthenticate = vi.fn<(body: LoginCredentials) => Promise<void>>()
const mockIsAuthenticated = vi.fn<() => boolean>()
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
  log: vi.fn<(...args: readonly unknown[]) => void>(),
  setDeviceSettings: vi.fn<(settings: Settings) => Promise<void>>(),
}

const mockI18n = { getLanguage: vi.fn<() => string>() }

const mockTranslate = vi.fn<(key: string) => string>((key) => key)

const homey = mock<Homey>({ __: mockTranslate, app: mockApp, i18n: mockI18n })

const SETTINGS_PAGE = 'Settings page'

describe('api', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('authentication', () => {
    it('should delegate to app.api.authenticate and log the breadcrumb', async () => {
      const credentials = mock<LoginCredentials>({
        password: 'pass',
        username: 'user',
      })
      mockAuthenticate.mockResolvedValue()

      await api.authenticate({ body: credentials, homey })

      expect(mockAuthenticate).toHaveBeenCalledWith(credentials)
      expect(mockApp.log).toHaveBeenCalledWith({
        dataType: SETTINGS_PAGE,
        route: 'POST /sessions',
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

  describe('device settings retrieval', () => {
    it('should delegate to app.getDeviceSettings and log the breadcrumb', () => {
      const deviceSettings = mock<DeviceSettings>()
      mockApp.getDeviceSettings.mockReturnValue(deviceSettings)

      const result = api.getDeviceSettings({ homey })

      expect(result).toBe(deviceSettings)
      expect(mockApp.getDeviceSettings).toHaveBeenCalledTimes(1)
      expect(mockApp.log).toHaveBeenCalledWith({
        dataType: SETTINGS_PAGE,
        route: '/settings/devices',
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
        route: '/settings/drivers',
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
          route: '/language',
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
    it('should delegate to app.setDeviceSettings and log the breadcrumb', async () => {
      const body = mock<Settings>({ always_on: true })
      mockApp.setDeviceSettings.mockResolvedValue()

      await api.setDeviceSettings({ body, homey })

      expect(mockApp.setDeviceSettings).toHaveBeenCalledWith(body)
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
})
