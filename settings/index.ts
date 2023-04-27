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

  async function getDeviceSettings(): Promise<DeviceSetting[]> {
    return await new Promise<DeviceSetting[]>((resolve, reject) => {
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
    })
  }

  const allSettings: DeviceSetting[] = await getDeviceSettings()
  const settings = allSettings.filter(
    (setting: DeviceSetting): boolean => setting.groupId !== 'login'
  )

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
  const loginElement: HTMLDivElement = document.getElementById(
    'login'
  ) as HTMLDivElement
  const settingsElement: HTMLDivElement = document.getElementById(
    'settings'
  ) as HTMLDivElement

  const credentialElements: Array<HTMLInputElement | null> = await Promise.all(
    ['username', 'password'].map(
      async (credentialKey: string): Promise<HTMLInputElement | null> => {
        const setting: DeviceSetting | undefined = allSettings.find(
          (setting: DeviceSetting): boolean => setting.id === credentialKey
        )
        if (setting === undefined) {
          return null
        }
        const divElement: HTMLDivElement = document.createElement('div')
        divElement.classList.add('homey-form-group')
        const labelElement: HTMLLabelElement = document.createElement('label')
        labelElement.classList.add('homey-form-label')
        labelElement.innerText = setting.title
        const inputElement: HTMLInputElement = document.createElement('input')
        inputElement.classList.add('homey-form-input')
        inputElement.id = setting.id
        labelElement.setAttribute('for', inputElement.id)
        inputElement.type = setting.type
        inputElement.placeholder = setting.placeholder ?? ''
        await getHomeySetting(inputElement)
        loginElement.appendChild(labelElement)
        loginElement.appendChild(inputElement)
        return inputElement
      }
    )
  )

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

  function int(
    element: HTMLInputElement,
    value: number = Number.parseInt(element.value)
  ): number {
    const minValue: number = Number(element.min)
    const maxValue: number = Number(element.max)
    if (Number.isNaN(value) || value < minValue || value > maxValue) {
      element.value = ''
      const labelElement: HTMLLabelElement | null = document.querySelector(
        `label[for="${element.id}"]`
      )
      throw new Error(
        Homey.__('settings.int_error', {
          name: Homey.__(labelElement?.innerText ?? ''),
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
      async (error: Error): Promise<void> => {
        if (error !== null) {
          // @ts-expect-error bug
          await Homey.alert(error.message)
          return
        }
        buttonElement.classList.remove('is-disabled')
        // @ts-expect-error bug
        await Homey.alert(Homey.__('settings.success'))
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
          if (ok) {
            buttonElement.classList.add('is-disabled')
            setDeviceSettings(buttonElement, body)
          }
        }
      )
    })
  }

  function generateMixinChildrenElements(): void {
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
        divElement.appendChild(labelElement)
        const selectElement = document.createElement('select')
        selectElement.className = 'homey-form-select'
        selectElement.id = setting.id
        labelElement.setAttribute('for', selectElement.id)
        ;[
          { id: '' },
          ...(setting.type === 'checkbox'
            ? [{ id: 'false' }, { id: 'true' }]
            : setting.values ?? [])
        ].forEach((value: { id: string; label?: string }): void => {
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
    generateMixinChildrenElements()
    hide(authenticatingElement)
    unhide(authenticatedElement)
  }

  async function login(): Promise<void> {
    const [usernameElement, passwordElement]: Array<HTMLInputElement | null> =
      credentialElements
    const username: string = usernameElement?.value ?? ''
    const password: string = passwordElement?.value ?? ''
    if (username === '' || password === '') {
      authenticateElement.classList.remove('is-disabled')
      unhide(authenticatingElement)
      // @ts-expect-error bug
      await Homey.alert(Homey.__('settings.authenticate.failure'))
      return
    }
    const body: LoginCredentials = {
      username,
      password
    }
    // @ts-expect-error bug
    Homey.api(
      'POST',
      '/login',
      body,
      async (error: Error, login: boolean): Promise<void> => {
        authenticateElement.classList.remove('is-disabled')
        if (error !== null || !login) {
          unhide(authenticatingElement)
          if (error !== null) {
            // @ts-expect-error bug
            await Homey.alert(error.message)
            return
          }
          // @ts-expect-error bug
          await Homey.alert(Homey.__('settings.authenticate.failure'))
          return
        }
        hasAuthenticated()
      }
    )
  }

  authenticateElement.addEventListener('click', (): void => {
    authenticateElement.classList.add('is-disabled')
    void login()
  })

  await login()
}
