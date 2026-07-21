/**
 * Keys the app persists through `homey.settings`: the heatzy-api
 * session material (written via the lib's `SettingManager`) plus the
 * app's own bookkeeping.
 */
export interface HomeySettings {
  readonly expiry?: string | null
  readonly loginBackoffUntil?: string | null
  readonly notifiedVersion?: string | null
  readonly password?: string | null
  readonly token?: string | null
  readonly username?: string | null
}
