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
import type HeatzyApp from '../app'
import type { ErrorData, HomeyClass, HomeySettings } from '../types'

type APIClass = new (...args: any[]) => {
  readonly api: AxiosInstance
  readonly loginURL: string
}

const getAPIErrorMessage = (error: AxiosError): string => {
  const { data } = error.response ?? {}
  if (data !== undefined && data) {
    /* eslint-disable camelcase */
    const { error_message, detail_message } = data as ErrorData
    const errorMessage: string = detail_message ?? error_message ?? ''
    /* eslint-enable camelcase */
    if (errorMessage) {
      return errorMessage
    }
  }
  return error.message
}

export const getErrorMessage = (error: unknown): string => {
  let errorMessage = String(error)
  if (axios.isAxiosError(error)) {
    errorMessage = getAPIErrorMessage(error)
  } else if (error instanceof Error) {
    errorMessage = error.message
  }
  return errorMessage
}

const withAPI = <T extends HomeyClass>(base: T): APIClass & T =>
  class extends base {
    public readonly api: AxiosInstance = axios.create()

    public readonly loginURL: string = '/login'

    public constructor(...args: any[]) {
      super(...args)
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
      const errorMessage: string = getAPIErrorMessage(error)
      this.error(`Error in ${type}:`, error.config?.url, errorMessage)
      const app: HeatzyApp = this.homey.app as HeatzyApp
      if (
        error.response?.status === 400 &&
        app.retry &&
        error.config?.url !== this.loginURL
      ) {
        app.handleRetry()
        const loggedIn: boolean = await app.login()
        if (loggedIn && error.config) {
          return this.api.request(error.config)
        }
      }
      await this.setErrorWarning(errorMessage)
      return Promise.reject(error)
    }

    private async setErrorWarning(warning: string | null): Promise<void> {
      if (this.setWarning) {
        await this.setWarning(warning)
      }
    }
  }

export default withAPI
