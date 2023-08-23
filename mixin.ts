import { Device } from 'homey' // eslint-disable-line import/no-extraneous-dependencies
import axios from 'axios'
import type {
  AxiosError,
  AxiosInstance,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from 'axios'

type TimerClass = new (...args: any[]) => {
  error(...errorArgs: any[]): void
  log(...logArgs: any[]): void
  homey: {
    settings: {
      get(key: string): number | string | null
    }
  }
}

export default function WithAPIAndLogging<T extends TimerClass>(Base: T) {
  return class extends Base {
    api: AxiosInstance

    constructor(...args: any[]) {
      super(...args)
      this.api = axios.create()
      this.setupAxiosInterceptors()
    }

    setupAxiosInterceptors() {
      this.api.interceptors.request.use(
        (config: InternalAxiosRequestConfig): InternalAxiosRequestConfig =>
          this.handleRequest(config),
        (error: AxiosError): Promise<AxiosError> =>
          this.handleError('request', error)
      )
      this.api.interceptors.response.use(
        (response: AxiosResponse): AxiosResponse =>
          this.handleResponse(response),
        (error: AxiosError): Promise<AxiosError> =>
          this.handleError('response', error)
      )
    }

    handleRequest(
      config: InternalAxiosRequestConfig
    ): InternalAxiosRequestConfig {
      const updatedConfig: InternalAxiosRequestConfig = { ...config }
      updatedConfig.headers['X-Gizwits-User-token'] =
        this.homey.settings.get('token') ?? ''
      this.log(
        'Sending request:',
        updatedConfig.url,
        updatedConfig.method === 'post' ? updatedConfig.data : ''
      )
      return updatedConfig
    }

    handleResponse(response: AxiosResponse): AxiosResponse {
      this.log('Received response:', response.config.url, response.data)
      return response
    }

    handleError(
      type: 'request' | 'response',
      error: AxiosError
    ): Promise<AxiosError> {
      this.error(
        `Error in ${type}:`,
        error.config?.url,
        error.response ? error.response.data : error
      )
      return Promise.reject(error)
    }

    customLog(method: 'log' | 'error', ...args: any[]): void {
      if (this instanceof Device) {
        super[method](this.getName(), '-', ...args)
      } else {
        super[method](...args)
      }
    }

    error(...args: any[]): void {
      this.customLog('error', ...args)
    }

    log(...args: any[]): void {
      this.customLog('log', ...args)
    }
  }
}