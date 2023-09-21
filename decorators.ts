/* eslint-disable @typescript-eslint/no-unsafe-argument */
import type HeatzyDevice from './drivers/heatzy/device'

export default function addDeviceNameToLogs<
  T extends new (...args: any[]) => HeatzyDevice,
>(
  BaseClass: T,
  _context: ClassDecoratorContext, // eslint-disable-line @typescript-eslint/no-unused-vars
) {
  return class extends BaseClass {
    error(...args: any[]): void {
      this.customLog('error', ...args)
    }

    log(...args: any[]): void {
      this.customLog('log', ...args)
    }

    customLog(logType: 'error' | 'log', ...args: any[]): void {
      super[logType](this.getName(), '-', ...args)
    }
  }
}
