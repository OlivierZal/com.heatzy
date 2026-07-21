import type { Homey } from 'homey/lib/Homey'
import {
  type LoginCredentials,
  AuthenticationError,
} from '@olivierzal/heatzy-api'

import type { DeviceSettings, Settings } from './types/device-settings.mts'
import type { DriverSetting } from './types/driver-settings.mts'
import { getErrorMessage } from './lib/get-error-message.mts'

// The webview only receives an error MESSAGE across the app bridge, so
// login failures are classified here, where `instanceof` still works: a
// credential rejection reads differently from a transport failure.
const toLoginFailure = (homey: Homey, error: unknown): Error =>
  error instanceof AuthenticationError ?
    new Error(homey.__('settings.authenticate.rejected'))
  : new Error(getErrorMessage(error))

// Diagnostics breadcrumb: the settings webview is otherwise invisible in
// diagnostic reports (its routes never touch Heatzy), which makes
// "settings fail to load" reports undecidable — no line = the page's JS
// never ran; lines without a completed sequence = where it stopped.
const logSettingsRoute = (app: Homey['app'], route: string): void => {
  app.log({ dataType: 'Settings page', route })
}

const api = {
  authenticate: async ({
    body,
    homey,
  }: {
    body: LoginCredentials
    homey: Homey
  }): Promise<void> => {
    logSettingsRoute(homey.app, 'POST /sessions')
    try {
      await homey.app.api.authenticate(body)
    } catch (error) {
      throw toLoginFailure(homey, error)
    }
  },
  getDeviceSettings: ({ homey }: { homey: Homey }): DeviceSettings => {
    logSettingsRoute(homey.app, '/settings/devices')
    return homey.app.getDeviceSettings()
  },
  getDriverSettings: ({
    homey,
  }: {
    homey: Homey
  }): Partial<Record<string, DriverSetting[]>> => {
    logSettingsRoute(homey.app, '/settings/drivers')
    return homey.app.getDriverSettings()
  },
  getLanguage: ({ homey }: { homey: Homey }): string => {
    logSettingsRoute(homey.app, '/language')
    return homey.i18n.getLanguage()
  },
  isAuthenticated: ({ homey }: { homey: Homey }): boolean => {
    logSettingsRoute(homey.app, 'GET /sessions')
    return homey.app.api.isAuthenticated()
  },
  logOut: ({ homey }: { homey: Homey }): void => {
    logSettingsRoute(homey.app, 'DELETE /sessions')
    homey.app.api.logOut()
  },
  logWebviewBoot: ({
    body,
    homey,
  }: {
    body: {
      message?: string
      name?: string
      probe?: string
      stack?: string
      userAgent?: string
    }
    homey: Homey
  }): void => {
    homey.app.error('Settings webview boot failure:', body)
  },
  setDeviceSettings: async ({
    body,
    homey,
  }: {
    body: Settings
    homey: Homey
  }): Promise<void> => {
    logSettingsRoute(homey.app, 'PUT /settings/devices')
    await homey.app.setDeviceSettings(body)
  },
}

export default api
