/* eslint-disable
  @typescript-eslint/no-explicit-any,
  @typescript-eslint/no-unsafe-argument
*/
type LogClass = new (...args: any[]) => {
  error(...errorArgs: any[]): void
  log(...logArgs: any[]): void
}

export default function addToLogs<T extends LogClass>(...logs: string[]) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return function actualDecorator(Base: T, _context: ClassDecoratorContext) {
    return class HeatzyLogsDecorator extends Base {
      error(...args: any[]): void {
        this.commonLog('error', ...args)
      }

      log(...args: any[]): void {
        this.commonLog('log', ...args)
      }

      commonLog(logType: 'error' | 'log', ...args: any[]): void {
        super[logType](
          ...logs.flatMap((log: string): [any, '-'] => {
            if (log.endsWith('()')) {
              const funcName: string = log.slice(0, -2)
              const func: () => any = (this as Record<any, any>)[
                funcName
              ] as () => any
              if (typeof func === 'function' && !func.length) {
                return [func.call(this), '-']
              }
            }
            if (log in this) {
              return [(this as Record<any, any>)[log], '-']
            }
            return [log, '-']
          }),
          ...args,
        )
      }
    }
  }
}
