/**
 * What the sign-in route answers once the server accepted the
 * credentials. The library enforces a registry sync after the sign-in
 * itself, so an accepted account can still end up with a device list
 * the app could not refresh: `isDeviceListStale` carries that
 * half-failure to the page, which reports it WITHOUT sending the user
 * back to the login form. A refreshed list can also hold no radiator the
 * app can read (`isAccountEmpty`: the account itself has nothing to
 * offer) or radiators none of which is in Homey yet (`isPairingPending`):
 * the page says which, and points at the pairing wizard for the latter,
 * instead of showing blank device settings.
 */
export interface AuthenticationResult {
  readonly isAccountEmpty: boolean
  readonly isDeviceListStale: boolean
  readonly isPairingPending: boolean
}
