import {
  type AxiosError,
  type AxiosInstance,
  type AxiosResponse,
  HttpStatusCode,
  type InternalAxiosRequestConfig,
  create as createAxiosInstance,
} from 'axios'
import type {
  Bindings,
  Data,
  DeviceData,
  DevicePostDataAny,
  LoginCredentials,
  LoginData,
  LoginPostData,
} from './types'
import { DateTime, Duration } from 'luxon'
import createAPICallErrorData, {
  type APICallContextDataWithErrorMessage,
} from './lib/APICallErrorData'
import APICallRequestData from './lib/APICallRequestData'
import APICallResponseData from './lib/APICallResponseData'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Logger = (...args: any[]) => void

interface APISettings {
  readonly expireAt?: number | null
  readonly password?: string | null
  readonly token?: string | null
  readonly username?: string | null
}

interface SettingManager {
  get: <K extends keyof APISettings>(
    key: K,
  ) => APISettings[K] | null | undefined
  set: <K extends keyof APISettings>(key: K, value: APISettings[K]) => void
}

const LOGIN_URL = '/login'
const NUMBER_0 = 0

const throwIfRequested = (error: unknown, raise: boolean): void => {
  if (raise) {
    throw new Error(error instanceof Error ? error.message : String(error))
  }
}

export default class MELCloudAPI {
  #retry = true

  #retryTimeout!: NodeJS.Timeout

  readonly #api: AxiosInstance

  readonly #errorLogger: Logger

  readonly #logger: Logger

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
    this.#api = createAxiosInstance({
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
    return response
  }

  async #handleError(error: AxiosError): Promise<AxiosError> {
    const apiCallData: APICallContextDataWithErrorMessage =
      createAPICallErrorData(error)
    this.#errorLogger(String(apiCallData))
    if (
      error.response?.status === HttpStatusCode.BadRequest &&
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

  async #handleRequest(
    config: InternalAxiosRequestConfig,
  ): Promise<InternalAxiosRequestConfig> {
    const newConfig: InternalAxiosRequestConfig = { ...config }
    if (newConfig.url !== LOGIN_URL) {
      const expiredAt: number = this.#settingManager.get('expireAt') ?? NUMBER_0
      if (expiredAt && DateTime.fromSeconds(expiredAt) < DateTime.now()) {
        await this.applyLogin()
      }
    }
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
      async (
        config: InternalAxiosRequestConfig,
      ): Promise<InternalAxiosRequestConfig> => this.#handleRequest(config),
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
