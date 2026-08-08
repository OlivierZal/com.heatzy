/**
 * Keys the app persists through `homey.settings`: the heatzy-api
 * session material (written via the lib's `SettingManager`) plus the
 * app's own bookkeeping.
 */
export interface HomeySettings {
  /**
   * The previous major's expiry key, still on disk for anyone upgrading
   * from it. Declared so the boot-time cleanup can name it; never read.
   * @deprecated Superseded by `expiry`, and cleared at boot.
   */
  readonly expireAt?: string | null
  readonly expiry?: string | null
  readonly loginBackoffUntil?: string | null
  readonly notifiedVersion?: string | null
  readonly password?: string | null
  readonly token?: string | null
  readonly username?: string | null
}
