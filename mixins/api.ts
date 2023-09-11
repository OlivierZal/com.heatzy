/* eslint-disable @typescript-eslint/no-unsafe-argument */
import axios, {
  type AxiosError,
  type AxiosInstance,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios'
import type { HomeySettingValue } from '../types'

type ApiClass = new (...args: any[]) => {
  error(...errorArgs: any[]): void
  log(...logArgs: any[]): void
  homey: {
    settings: {
      get(key: string): HomeySettingValue
    }
  }
}

export default function WithAPI<T extends ApiClass>(Base: T) {
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
  }
}
