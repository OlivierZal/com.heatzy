import type Homey from 'homey/lib/Homey'
import {
  type LoginCredentials,
  type Settings,
  type SettingsData
} from '../types'

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function onHomeyReady(Homey: Homey): Promise<void> {
  await Homey.ready()

  async function getLocale(): Promise<string> {
    return await new Promise<string>((resolve, reject) => {
      // @ts-expect-error bug
      Homey.api(
        'GET',
        '/locale',
        async (error: Error, locale: string): Promise<void> => {
          if (error !== null) {
            reject(error)
            return
          }
          document.documentElement.setAttribute('lang', locale)
          resolve(locale)
        }
      )
    })
  }

  async function getDeviceSettings(driverId?: string): Promise<SettingsData[]> {
    return await new Promise<SettingsData[]>((resolve, reject) => {
      let endPoint: string = '/devices/settings'
      if (driverId !== undefined) {
        const queryString: string = new URLSearchParams({
          driverId
        }).toString()
        endPoint += `?${queryString}`
      }
      // @ts-expect-error bug
      Homey.api(
        'GET',
        endPoint,
        async (error: Error, settings: SettingsData[]): Promise<void> => {
          if (error !== null) {
            // @ts-expect-error bug
            await Homey.alert(error.message)
            reject(error)
            return
          }
          resolve(settings)
        }
      )
    })
  }

  const locale: string = await getLocale()
  const settings: SettingsData[] = await getDeviceSettings()

  const applySettingsElement: HTMLButtonElement = document.getElementById(
    'apply-settings'
  ) as HTMLButtonElement
  const authenticateElement: HTMLButtonElement = document.getElementById(
    'authenticate'
  ) as HTMLButtonElement

  const authenticatedElement: HTMLDivElement = document.getElementById(
    'authenticated'
  ) as HTMLDivElement
  const authenticatingElement: HTMLDivElement = document.getElementById(
    'authenticating'
  ) as HTMLDivElement

  const usernameElement: HTMLInputElement = document.getElementById(
    'username'
  ) as HTMLInputElement
  const passwordElement: HTMLInputElement = document.getElementById(
    'password'
  ) as HTMLInputElement

  const alwaysOnLabelElement: HTMLLabelElement = document.getElementById(
    'settings-always_on'
  ) as HTMLLabelElement
  const onModeLabelElement: HTMLLabelElement = document.getElementById(
    'settings-on_mode'
  ) as HTMLLabelElement

  const alwaysOnElement: HTMLSelectElement = document.getElementById(
    'always_on'
  ) as HTMLSelectElement
  const onModeElement: HTMLSelectElement = document.getElementById(
    'on_mode'
  ) as HTMLSelectElement

  function unhide(element: HTMLDivElement, value: boolean = true): void {
    if (value) {
      if (element.classList.contains('hidden')) {
        element.classList.remove('hidden')
      }
    } else if (!element.classList.contains('hidden')) {
      element.classList.add('hidden')
    }
  }

  function hide(element: HTMLDivElement): void {
    unhide(element, false)
  }

  async function getHomeySetting(
    element: HTMLInputElement | HTMLSelectElement,
    defaultValue: any = ''
  ): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      // @ts-expect-error bug
      Homey.get(element.id, async (error: Error, value: any): Promise<void> => {
        if (error !== null) {
          // @ts-expect-error bug
          await Homey.alert(error.message)
          reject(error)
          return
        }
        element.value = String(value ?? defaultValue)
        resolve()
      })
    })
  }

  function int(
    element: HTMLInputElement,
    value: number = Number.parseInt(element.value)
  ): number {
    const minValue: number = Number(element.min)
    const maxValue: number = Number(element.max)
    if (Number.isNaN(value) || value < minValue || value > maxValue) {
      element.value = ''
      throw new Error(
        Homey.__('settings.int_error.message', {
          name: Homey.__(`settings.int_error.values.${element.id}`),
          min: minValue,
          max: maxValue
        })
      )
    }
    return value
  }

  function buildSettingsBody(
    settings: Array<HTMLInputElement | HTMLSelectElement>
  ): Settings {
    return settings.reduce<Settings>(
      (body, setting: HTMLInputElement | HTMLSelectElement) => {
        if (setting.value !== '') {
          const settingValue: number = Number.parseInt(setting.value)
          if (!Number.isNaN(settingValue)) {
            body[setting.id] =
              setting instanceof HTMLInputElement
                ? int(setting, settingValue)
                : settingValue
          } else if (
            setting instanceof HTMLInputElement &&
            setting.type === 'checkbox'
          ) {
            body[setting.id] = setting.checked
          } else if (['true', 'false'].includes(setting.value)) {
            body[setting.id] = setting.value === 'true'
          } else {
            body[setting.id] = setting.value
          }
        }
        return body
      },
      {}
    )
  }

  function hasAuthenticated(): void {
    hide(authenticatingElement)
    unhide(authenticatedElement)
  }

  function getDeviceSetting(
    settings: SettingsData[],
    id: string
  ): SettingsData | undefined {
    return settings.find((setting: SettingsData): boolean => setting.id === id)
  }

  function login(): void {
    const body: LoginCredentials = {
      username: usernameElement.value,
      password: passwordElement.value
    }
    // @ts-expect-error bug
    Homey.api(
      'POST',
      '/login',
      body,
      async (error: Error, login: boolean): Promise<void> => {
        authenticateElement.classList.remove('is-disabled')
        if (error !== null) {
          // @ts-expect-error bug
          await Homey.alert(error.message)
          return
        }
        if (!login) {
          unhide(authenticatingElement)
          // @ts-expect-error bug
          await Homey.alert(
            Homey.__('settings.alert.failure', {
              action: Homey.__('settings.alert.actions.authenticate')
            })
          )
          return
        }
        hasAuthenticated()
      }
    )
  }

  function setDeviceSettings(
    buttonElement: HTMLButtonElement,
    body: Settings,
    driverId?: string
  ): void {
    let endPoint: string = '/devices/settings'
    if (driverId !== undefined) {
      const queryString: string = new URLSearchParams({
        driverId
      }).toString()
      endPoint += `?${queryString}`
    }
    // @ts-expect-error bug
    Homey.api(
      'POST',
      endPoint,
      body,
      async (error: Error, success: boolean): Promise<void> => {
        if (error !== null) {
          setDeviceSettings(buttonElement, body, driverId)
          return
        }
        buttonElement.classList.remove('is-disabled')
        if (!success) {
          // @ts-expect-error bug
          await Homey.alert(
            Homey.__('settings.alert.failure', {
              action: Homey.__('settings.alert.actions.update')
            })
          )
          return
        }
        // @ts-expect-error bug
        await Homey.alert(
          Homey.__('settings.alert.success', {
            action: Homey.__('settings.alert.actions.update')
          })
        )
      }
    )
  }

  function addSettingsEventListener(
    buttonElement: HTMLButtonElement,
    elements: Array<HTMLInputElement | HTMLSelectElement>,
    driverId?: string
  ): void {
    buttonElement.addEventListener('click', (): void => {
      let body: Settings = {}
      try {
        body = buildSettingsBody(elements)
      } catch (error: unknown) {
        // @ts-expect-error bug
        Homey.alert(error instanceof Error ? error.message : String(error))
        return
      }
      if (Object.keys(body).length === 0) {
        // @ts-expect-error bug
        Homey.alert(Homey.__('settings.devices.apply.nothing'))
        return
      }
      // @ts-expect-error bug
      Homey.confirm(
        Homey.__('settings.devices.apply.confirm'),
        null,
        async (error: Error, ok: boolean): Promise<void> => {
          if (error !== null) {
            // @ts-expect-error bug
            await Homey.alert(error.message)
            return
          }
          if (!ok) {
            // @ts-expect-error bug
            await Homey.alert(
              Homey.__('settings.alert.failure', {
                action: Homey.__('settings.alert.actions.update')
              })
            )
            return
          }
          buttonElement.classList.add('is-disabled')
          setDeviceSettings(buttonElement, body, driverId)
        }
      )
    })
  }
  const alwaysOnSetting = getDeviceSetting(settings, 'always_on')
  alwaysOnLabelElement.innerText = alwaysOnSetting?.title[locale] ?? ''
  const onModeSetting = getDeviceSetting(settings, 'on_mode')
  onModeLabelElement.innerText = onModeSetting?.title[locale] ?? ''

  await getHomeySetting(usernameElement)
  await getHomeySetting(passwordElement)
  login()

  authenticateElement.addEventListener('click', (): void => {
    authenticateElement.classList.add('is-disabled')
    login()
  })

  addSettingsEventListener(applySettingsElement, [
    alwaysOnElement,
    onModeElement
  ])
}
