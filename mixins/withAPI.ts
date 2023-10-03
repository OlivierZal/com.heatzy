/* eslint-disable @typescript-eslint/no-unsafe-argument */
import type Homey from 'homey/lib/Homey'
import axios, {
  type AxiosError,
  type AxiosInstance,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios'
import type { HomeySettings } from '../types'

type ApiClass = new (...args: any[]) => {
  homey: Homey
  /* eslint-disable @typescript-eslint/method-signature-style */
  error(...errorArgs: any[]): void
  log(...logArgs: any[]): void
  /* eslint-enable @typescript-eslint/method-signature-style */
}

/* eslint-disable-next-line
  @typescript-eslint/explicit-function-return-type,
  @typescript-eslint/explicit-module-boundary-types
*/
export default function withAPI<T extends ApiClass>(base: T) {
  return class extends base {
    protected api: AxiosInstance

    private constructor(...args: any[]) {
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
        error.response ? error.response.data : error,
      )
      return Promise.reject(error)
    }
  }
}
