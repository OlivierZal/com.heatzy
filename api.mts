import type { DriverSetting } from '@olivierzal/homey-kit/manifest'
import type { Homey } from 'homey/lib/Homey'
import {
  type LoginCredentials,
  AuthenticationError,
  RegistrySyncError,
} from '@olivierzal/heatzy-api'
import { getErrorMessage } from '@olivierzal/homey-kit'
import { getWebviewHashes } from '@olivierzal/homey-kit/node'

import type { AuthenticationResult } from './types/api.mts'
import type { DeviceSettings, Settings } from './types/device-settings.mts'

// The webview only receives an error MESSAGE across the app bridge, so
// login failures are classified here, where `instanceof` still works: a
// credential rejection reads differently from a transport failure.
const toLoginFailure = (homey: Homey, error: unknown): Error =>
  error instanceof AuthenticationError
    ? new Error(homey.__('settings.authenticate.rejected'))
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
  }): Promise<AuthenticationResult> => {
    logSettingsRoute(homey.app, 'POST /sessions')
    try {
      await homey.app.api.authenticate(body)
    } catch (error) {
      // A rejection is not proof the credentials were refused: the
      // library enforces a registry sync AFTER the server accepted the
      // sign-in, and that failure arrives wrapped as its own TYPE —
      // `RegistrySyncError` means the account is in and only the device
      // list is stale. The type is the arbiter; re-deriving the verdict
      // from the session read "signed in" on a transport failure over a
      // PRE-EXISTING live session while the new credentials were never
      // accepted.
      if (error instanceof RegistrySyncError) {
        return { isDeviceListStale: true }
      }
      throw toLoginFailure(homey, error)
    }
    return { isDeviceListStale: false }
  },
  getDeviceSettings: ({ homey }: { homey: Homey }): DeviceSettings => {
    logSettingsRoute(homey.app, 'GET /settings/devices')
    return homey.app.getDeviceSettings()
  },
  getDriverSettings: ({
    homey,
  }: {
    homey: Homey
  }): Partial<Record<string, DriverSetting[]>> => {
    logSettingsRoute(homey.app, 'GET /settings/drivers')
    return homey.app.getDriverSettings()
  },
  getLanguage: ({ homey }: { homey: Homey }): string => {
    logSettingsRoute(homey.app, 'GET /language')
    return homey.i18n.getLanguage()
  },
  getWebviewHashes: async ({
    homey,
  }: {
    homey: Homey
  }): Promise<Partial<Record<string, string>>> => {
    logSettingsRoute(homey.app, 'GET /webview-hashes')
    // The manifest URL is passed explicitly: the kit resolves its
    // default against its own module, which sits in `node_modules` —
    // only the caller knows where the bundler stamped the manifest.
    return getWebviewHashes(new URL('webview-hashes.json', import.meta.url))
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
  updateDeviceSettings: async ({
    body,
    homey,
  }: {
    body: Settings
    homey: Homey
  }): Promise<void> => {
    logSettingsRoute(homey.app, 'PUT /settings/devices')
    await homey.app.updateDeviceSettings(body)
  },
}

export default api
