/**
 * What the sign-in route answers once the server accepted the
 * credentials. The library enforces a registry sync after the sign-in
 * itself, so an accepted account can still end up with a device list
 * the app could not refresh: `isDeviceListStale` carries that
 * half-failure to the page, which reports it WITHOUT sending the user
 * back to the login form. A refreshed list can also hold radiators none
 * of which is in Homey yet: `isPairingPending` says so, and the page
 * points at the pairing wizard instead of showing blank device settings.
 */
export interface AuthenticationResult {
  readonly isDeviceListStale: boolean
  readonly isPairingPending: boolean
}
