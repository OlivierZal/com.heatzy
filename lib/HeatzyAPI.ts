import type {
  APISettings,
  Bindings,
  Data,
  DeviceData,
  DevicePostDataAny,
  LoginCredentials,
  LoginData,
  LoginPostData,
} from '../types/HeatzyAPITypes'
import { DateTime, Duration } from 'luxon'
import axios, {
  type AxiosError,
  type AxiosInstance,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios'
import type { APICallContextDataWithErrorMessage } from '../mixins/withErrorMessage'
import APICallRequestData from './APICallRequestData'
import APICallResponseData from './APICallResponseData'
import createAPICallErrorData from './APICallErrorData'

interface SettingManager {
  get: <K extends keyof APISettings>(
    key: K,
  ) => APISettings[K] | null | undefined
  set: <K extends keyof APISettings>(key: K, value: APISettings[K]) => void
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Logger = (...args: any[]) => void

const DEFAULT_0 = 0
const LOGIN_URL = '/login'
const MAX_INT32 = 2147483647
const MS_PER_DAY = 86400000
const NO_TIME_DIFF = 0

const throwIfRequested = (error: unknown, raise: boolean): void => {
  if (raise) {
    throw new Error(error instanceof Error ? error.message : String(error))
  }
}

export default class MELCloudAPI {
  #loginTimeout!: NodeJS.Timeout

  #retry = true

  #retryTimeout!: NodeJS.Timeout

  readonly #api: AxiosInstance

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly #errorLogger: (...args: any[]) => void

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly #logger: (...args: any[]) => void

  readonly #settingManager: SettingManager

  public constructor(
    settingManager: SettingManager,
    // eslint-disable-next-line no-console
    logger: Logger = console.log,
    errorLogger: Logger = logger,
  ) {
    this.#settingManager = settingManager
    this.#logger = logger
    this.#errorLogger = errorLogger
    this.#api = axios.create({
      baseURL: 'https://euapi.gizwits.com/app',
      headers: {
        'X-Gizwits-Application-Id': 'c70a66ff039d41b4a220e198b0fcc8b3',
      },
    })
    this.#setupAxiosInterceptors()
  }

  public async applyLogin(
    { password, username }: LoginCredentials = {
      password: this.#settingManager.get('password') ?? '',
      username: this.#settingManager.get('username') ?? '',
    },
    raise = false,
  ): Promise<boolean> {
    if (username && password) {
      try {
        await this.login({ password, username })
        return true
      } catch (error: unknown) {
        throwIfRequested(error, raise)
      }
    }
    return false
  }

  public async bindings(): Promise<{ data: Bindings }> {
    return this.#api.get<Bindings>('/bindings')
  }

  public clearLoginRefresh(): void {
    clearTimeout(this.#loginTimeout)
    this.#logger('Login refresh has been paused')
  }

  public async control(
    id: string,
    postData: DevicePostDataAny,
  ): Promise<{ data: Data }> {
    return this.#api.post<Data>(`/control/${id}`, postData)
  }

  public async deviceData(id: string): Promise<{ data: DeviceData }> {
    return this.#api.get<DeviceData>(`/devdata/${id}/latest`)
  }

  public async login(postData: LoginPostData): Promise<{ data: LoginData }> {
    const response: AxiosResponse<LoginData> = await this.#api.post<LoginData>(
      LOGIN_URL,
      postData,
    )
    this.#settingManager.set('username', postData.username)
    this.#settingManager.set('password', postData.password)
    this.#settingManager.set('token', response.data.token)
    this.#settingManager.set('expireAt', response.data.expire_at)
    await this.planRefreshLogin()
    return response
  }

  public async planRefreshLogin(): Promise<boolean> {
    this.clearLoginRefresh()
    const expiredAt: number = this.#settingManager.get('expireAt') ?? DEFAULT_0
    const ms: number = DateTime.fromSeconds(expiredAt)
      .minus({ days: 1 })
      .diffNow()
      .as('milliseconds')
    if (ms > NO_TIME_DIFF) {
      const interval: number = Math.min(ms, MAX_INT32)
      this.#loginTimeout = setTimeout((): void => {
        this.applyLogin().catch((error: Error) => {
          this.#errorLogger(error.message)
        })
      }, interval)
      this.#logger(
        'Login refresh will run in',
        Math.floor(interval / MS_PER_DAY),
        'days',
      )
      return true
    }
    return this.applyLogin()
  }

  async #handleError(error: AxiosError): Promise<AxiosError> {
    const apiCallData: APICallContextDataWithErrorMessage =
      createAPICallErrorData(error)
    this.#errorLogger(String(apiCallData))
    if (
      error.response?.status === axios.HttpStatusCode.BadRequest &&
      this.#retry &&
      error.config?.url !== LOGIN_URL
    ) {
      this.#handleRetry()
      if ((await this.applyLogin()) && error.config) {
        return this.#api.request(error.config)
      }
    }
    return Promise.reject(new Error(apiCallData.errorMessage))
  }

  #handleRequest(
    config: InternalAxiosRequestConfig,
  ): InternalAxiosRequestConfig {
    const newConfig: InternalAxiosRequestConfig = { ...config }
    if (newConfig.url !== LOGIN_URL) {
      newConfig.headers.set(
        'X-Gizwits-User-token',
        this.#settingManager.get('token'),
      )
    }
    this.#logger(String(new APICallRequestData(newConfig)))
    return newConfig
  }

  #handleResponse(response: AxiosResponse): AxiosResponse {
    this.#logger(String(new APICallResponseData(response)))
    return response
  }

  #handleRetry(): void {
    this.#retry = false
    clearTimeout(this.#retryTimeout)
    this.#retryTimeout = setTimeout(
      () => {
        this.#retry = true
      },
      Duration.fromObject({ minutes: 1 }).as('milliseconds'),
    )
  }

  #setupAxiosInterceptors(): void {
    this.#api.interceptors.request.use(
      (config: InternalAxiosRequestConfig): InternalAxiosRequestConfig =>
        this.#handleRequest(config),
      async (error: AxiosError): Promise<AxiosError> =>
        this.#handleError(error),
    )
    this.#api.interceptors.response.use(
      (response: AxiosResponse): AxiosResponse =>
        this.#handleResponse(response),
      async (error: AxiosError): Promise<AxiosError> =>
        this.#handleError(error),
    )
  }
}
