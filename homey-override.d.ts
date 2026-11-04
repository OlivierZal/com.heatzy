import type HeatzyApp from './app.mts'

declare module 'homey' {
  interface HomeyTypes {
    app: HeatzyApp
  }
}
