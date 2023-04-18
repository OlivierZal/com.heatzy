import type Homey from 'homey/lib/Homey'
import {
  type DeviceSetting,
  type LoginCredentials,
  type Settings
} from '../types'

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function onHomeyReady(Homey: Homey): Promise<void> {
  await Homey.ready()

  await new Promise<string>((resolve, reject) => {
    // @ts-expect-error bug
    Homey.api(
      'GET',
      '/language',
      async (error: Error, language: string): Promise<void> => {
        if (error !== null) {
          reject(error)
          return
        }
        document.documentElement.setAttribute('lang', language)
        resolve(language)
      }
    )
  })

  const settings: DeviceSetting[] = await new Promise<DeviceSetting[]>(
    (resolve, reject) => {
      // @ts-expect-error bug
      Homey.api(
        'GET',
        '/devices/settings',
        async (error: Error, settings: DeviceSetting[]): Promise<void> => {
          if (error !== null) {
            // @ts-expect-error bug
            await Homey.alert(error.message)
            reject(error)
            return
          }
          resolve(settings)
        }
      )
    }
  )

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
  const settingsElement: HTMLDivElement = document.getElementById(
    'settings'
  ) as HTMLDivElement

  const usernameElement: HTMLInputElement = document.getElementById(
    'username'
  ) as HTMLInputElement
  const passwordElement: HTMLInputElement = document.getElementById(
    'password'
  ) as HTMLInputElement

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

  function setDeviceSettings(
    buttonElement: HTMLButtonElement,
    body: Settings
  ): void {
    // @ts-expect-error bug
    Homey.api(
      'POST',
      '/devices/settings',
      body,
      async (error: Error, success: boolean): Promise<void> => {
        if (error !== null) {
          setDeviceSettings(buttonElement, body)
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
    elements: Array<HTMLInputElement | HTMLSelectElement>
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
          setDeviceSettings(buttonElement, body)
        }
      )
    })
  }

  function generateSelectChildrenElements(
    settings: DeviceSetting[],
    settingsElement: HTMLDivElement,
    applySettingsElement: HTMLButtonElement
  ): void {
    settings
      .filter((setting: DeviceSetting): boolean =>
        ['checkbox', 'dropdown'].includes(setting.type)
      )
      .forEach((setting: DeviceSetting): void => {
        const divElement: HTMLDivElement = document.createElement('div')
        divElement.className = 'homey-form-group'
        const labelElement = document.createElement('label')
        labelElement.className = 'homey-form-label'
        labelElement.id = `setting-${setting.id}`
        labelElement.innerText = setting.title
        labelElement.setAttribute('for', setting.id)
        divElement.appendChild(labelElement)
        const selectElement = document.createElement('select')
        selectElement.className = 'homey-form-select'
        ;[
          { id: '' },
          ...(setting.type === 'checkbox'
            ? [{ id: 'false' }, { id: 'true' }]
            : setting.values ?? [])
        ].forEach((value: { id: string; label?: string }) => {
          const { id, label } = value
          const optionElement: HTMLOptionElement =
            document.createElement('option')
          optionElement.value = id
          if (id !== '') {
            optionElement.innerText =
              label ?? Homey.__(`settings.boolean.${id}`)
          }
          selectElement.appendChild(optionElement)
        })
        divElement.appendChild(selectElement)
        settingsElement.appendChild(divElement)
      })
    addSettingsEventListener(
      applySettingsElement,
      Array.from(settingsElement.querySelectorAll('select'))
    )
  }

  function hasAuthenticated(): void {
    generateSelectChildrenElements(
      settings,
      settingsElement,
      applySettingsElement
    )
    hide(authenticatingElement)
    unhide(authenticatedElement)
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

  await getHomeySetting(usernameElement)
  await getHomeySetting(passwordElement)
  login()

  authenticateElement.addEventListener('click', (): void => {
    authenticateElement.classList.add('is-disabled')
    login()
  })
}
