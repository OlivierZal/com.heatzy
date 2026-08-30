import type { LoginCredentials } from '@olivierzal/heatzy-api'

/**
 * Minimal API-client surface used by the driver during pairing/repair.
 */
export interface AuthenticationAPI {
  readonly authenticate: (credentials: LoginCredentials) => Promise<void>
  readonly isAuthenticated: () => boolean
}

/**
 * What the sign-in route answers once the server accepted the
 * credentials. The library enforces a registry sync after the sign-in
 * itself, so an accepted account can still end up with a device list
 * the app could not refresh: `isDeviceListStale` carries that
 * half-failure to the page, which reports it WITHOUT sending the user
 * back to the login form.
 */
export interface AuthenticationResult {
  readonly isDeviceListStale: boolean
}
