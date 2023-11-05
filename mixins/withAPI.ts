/* eslint-disable
  @typescript-eslint/no-explicit-any,
  @typescript-eslint/no-unsafe-argument
*/
import axios, {
  type AxiosError,
  type AxiosInstance,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios'
import type { ErrorData, HomeyClass, HomeySettings } from '../types'

type APIClass = new (...args: any[]) => {
  api: AxiosInstance
}

export default function withAPI<T extends HomeyClass>(base: T): APIClass & T {
  return class extends base {
    public api: AxiosInstance

    public constructor(...args: any[]) {
      super(...args)
      this.api = axios.create()
      this.setupAxiosInterceptors()
    }

    private setupAxiosInterceptors(): void {
      this.api.interceptors.request.use(
        (config: InternalAxiosRequestConfig): InternalAxiosRequestConfig =>
          this.handleRequest(config),
        async (error: AxiosError): Promise<AxiosError> =>
          this.handleError('request', error),
      )
      this.api.interceptors.response.use(
        (response: AxiosResponse): AxiosResponse =>
          this.handleResponse(response),
        async (error: AxiosError): Promise<AxiosError> =>
          this.handleError('response', error),
      )
    }

    private handleRequest(
      config: InternalAxiosRequestConfig,
    ): InternalAxiosRequestConfig {
      const updatedConfig: InternalAxiosRequestConfig = { ...config }
      updatedConfig.headers['X-Gizwits-User-token'] =
        (this.homey.settings.get('token') as HomeySettings['token']) ?? ''
      this.log(
        'Sending request:',
        updatedConfig.url,
        updatedConfig.method === 'post' ? updatedConfig.data : '',
      )
      return updatedConfig
    }

    private handleResponse(response: AxiosResponse): AxiosResponse {
      this.log('Received response:', response.config.url, response.data)
      return response
    }

    private async handleError(
      type: 'request' | 'response',
      error: AxiosError,
    ): Promise<AxiosError> {
      this.error(
        `Error in ${type}:`,
        error.config?.url,
        error.response?.data ?? error.message,
      )
      await this.setErrorWarning(error)
      return Promise.reject(error)
    }

    private async setErrorWarning(error: AxiosError): Promise<void> {
      if (!this.setWarning) {
        return
      }
      if (error.response?.data === undefined) {
        await this.setWarning(error.message)
        return
      }
      /* eslint-disable camelcase */
      const { error_message, detail_message } = error.response.data as ErrorData
      await this.setWarning(detail_message ?? error_message ?? error.message)
      /* eslint-enable camelcase */
    }
  }
}
