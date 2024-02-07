import type {
  Bindings,
  Data,
  DeviceData,
  DevicePostDataAny,
  HomeyClass,
  HomeySettings,
  LoginCredentials,
  LoginData,
} from '../types'
import axios, {
  type AxiosError,
  type AxiosInstance,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios'
import APICallRequestData from '../lib/APICallRequestData'
import APICallResponseData from '../lib/APICallResponseData'
import type HeatzyApp from '../app'
import createAPICallErrorData from '../lib/APICallErrorData'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type APIClass = new (...args: any[]) => {
  readonly api: AxiosInstance
  readonly apiBindings: () => Promise<{ data: Bindings }>
  readonly apiControl: (
    id: string,
    postData: DevicePostDataAny,
  ) => Promise<{ data: Data }>
  readonly apiDeviceData: (id: string) => Promise<{ data: DeviceData }>
  readonly apiLogin: (
    postData: LoginCredentials,
  ) => Promise<{ data: LoginData }>
  readonly getHomeySetting: <K extends keyof HomeySettings>(
    setting: K,
  ) => HomeySettings[K]
}

const LOGIN_URL = '/login'

export const getErrorMessage = (error: unknown): string =>
  axios.isAxiosError(error) || error instanceof Error
    ? error.message
    : String(error)

// eslint-disable-next-line max-lines-per-function
const withAPI = <T extends HomeyClass>(base: T): APIClass & T =>
  class WithAPI extends base {
    public readonly api: AxiosInstance = axios.create()

    public readonly app: HeatzyApp = this.homey.app as HeatzyApp

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public constructor(...args: any[]) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      super(...args)
      this.setupAxiosInterceptors()
    }

    public getHomeySetting<K extends keyof HomeySettings>(
      setting: K,
    ): HomeySettings[K] {
      return this.homey.settings.get(setting) as HomeySettings[K]
    }

    public async apiLogin(
      postData: LoginCredentials,
    ): Promise<{ data: LoginData }> {
      return this.api.post<LoginData>(LOGIN_URL, postData)
    }

    public async apiBindings(): Promise<{ data: Bindings }> {
      return this.api.get<Bindings>('/bindings')
    }

    public async apiControl(
      id: string,
      postData: DevicePostDataAny,
    ): Promise<{ data: Data }> {
      return this.api.post<Data>(`/control/${id}`, postData)
    }

    public async apiDeviceData(id: string): Promise<{ data: DeviceData }> {
      return this.api.get<DeviceData>(`/devdata/${id}/latest`)
    }

    private setupAxiosInterceptors(): void {
      this.api.interceptors.request.use(
        (config: InternalAxiosRequestConfig): InternalAxiosRequestConfig =>
          this.handleRequest(config),
        async (error: AxiosError): Promise<AxiosError> =>
          this.handleError(error),
      )
      this.api.interceptors.response.use(
        (response: AxiosResponse): AxiosResponse =>
          this.handleResponse(response),
        async (error: AxiosError): Promise<AxiosError> =>
          this.handleError(error),
      )
    }

    private handleRequest(
      config: InternalAxiosRequestConfig,
    ): InternalAxiosRequestConfig {
      const updatedConfig: InternalAxiosRequestConfig = { ...config }
      updatedConfig.headers.set(
        'X-Gizwits-Application-Id',
        'c70a66ff039d41b4a220e198b0fcc8b3',
      )
      updatedConfig.headers.set(
        'X-Gizwits-User-token',
        this.getHomeySetting('token'),
      )
      this.log(String(new APICallRequestData(updatedConfig)))
      return updatedConfig
    }

    private handleResponse(response: AxiosResponse): AxiosResponse {
      this.log(String(new APICallResponseData(response)))
      return response
    }

    private async handleError(error: AxiosError): Promise<AxiosError> {
      const apiCallData = createAPICallErrorData(error)
      this.error(String(apiCallData))
      if (
        error.response?.status === axios.HttpStatusCode.BadRequest &&
        this.app.retry &&
        error.config?.url !== LOGIN_URL
      ) {
        this.app.handleRetry()
        if ((await this.app.login()) && error.config) {
          return this.api.request(error.config)
        }
      }
      await this.setErrorWarning(apiCallData.errorMessage)
      return Promise.reject(error)
    }

    private async setErrorWarning(warning: string | null): Promise<void> {
      if (this.setWarning) {
        await this.setWarning(warning)
      }
    }
  }

export default withAPI
