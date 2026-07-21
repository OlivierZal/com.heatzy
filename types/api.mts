import type { LoginCredentials } from '@olivierzal/heatzy-api'

/** Minimal API-client surface used by the driver during pairing/repair. */
export interface AuthenticationAPI {
  readonly authenticate: (credentials: LoginCredentials) => Promise<void>
  readonly isAuthenticated: () => boolean
}
