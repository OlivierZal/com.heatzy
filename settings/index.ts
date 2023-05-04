import type Homey from 'homey/lib/Homey'
import {
  type DeviceSettings,
  type DriverSetting,
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
        document.documentElement.lang = language
        resolve(language)
      }
    )
  })

  async function getDeviceSettings(): Promise<DeviceSettings> {
    return await new Promise<DeviceSettings>((resolve, reject) => {
      // @ts-expect-error bug
      Homey.api(
        'GET',
        '/devices/settings',
        async (error: Error, deviceSettings: DeviceSettings): Promise<void> => {
          if (error !== null) {
            // @ts-expect-error bug
            await Homey.alert(error.message)
            reject(error)
            return
          }
          resolve(deviceSettings)
        }
      )
    })
  }

  async function getDriverSettings(): Promise<DriverSetting[]> {
    return await new Promise<DriverSetting[]>((resolve, reject) => {
      // @ts-expect-error bug
      Homey.api(
        'GET',
        '/drivers/settings',
        async (
          error: Error,
          driverSettings: DriverSetting[]
        ): Promise<void> => {
          if (error !== null) {
            // @ts-expect-error bug
            await Homey.alert(error.message)
            reject(error)
            return
          }
          resolve(driverSettings)
        }
      )
    })
  }

  function flattenDeviceSettings(): Record<string, any[]> {
    return Object.values(deviceSettings).reduce<Record<string, any[]>>(
      (flatDeviceSettings, settings: Record<string, any[]>) =>
        Object.entries(settings).reduce<Record<string, any[]>>(
          (merged, [settingId, settingValues]: [string, any[]]) => {
            if (merged[settingId] === undefined) {
              merged[settingId] = []
            }
            merged[settingId].push(
              ...settingValues.filter(
                (settingValue: any): boolean =>
                  !merged[settingId].includes(settingValue)
              )
            )
            return merged
          },
          flatDeviceSettings
        ),
      {}
    )
  }

  const deviceSettings: DeviceSettings = await getDeviceSettings()
  const flatDeviceSettings: Record<string, any[]> = flattenDeviceSettings()

  const allDriverSettings: DriverSetting[] = await getDriverSettings()
  const driverSettings: DriverSetting[] = allDriverSettings.filter(
    (setting: DriverSetting): boolean => setting.groupId !== 'login'
  )

  async function getHomeySetting(
    id: string,
    defaultValue: any = ''
  ): Promise<string> {
    return await new Promise<string>((resolve, reject) => {
      // @ts-expect-error bug
      Homey.get(id, async (error: Error, value: any): Promise<void> => {
        if (error !== null) {
          // @ts-expect-error bug
          await Homey.alert(error.message)
          reject(error)
          return
        }
        resolve(String(value ?? defaultValue))
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

  const credentialKeys: string[] = ['username', 'password']
  const credentials: Record<string, string> = Object.assign(
    {},
    ...(await Promise.all(
      credentialKeys.map(
        async (credentialKey: string): Promise<Record<string, string>> => ({
          [credentialKey]: await getHomeySetting(credentialKey)
        })
      )
    ))
  )
  const [usernameElement, passwordElement]: Array<HTMLInputElement | null> =
    credentialKeys.map((credentialKey: string): HTMLInputElement | null => {
      const setting: DriverSetting | undefined = allDriverSettings.find(
        (setting: DriverSetting): boolean => setting.id === credentialKey
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
      labelElement.htmlFor = inputElement.id
      inputElement.type = setting.type
      inputElement.placeholder = setting.placeholder ?? ''
      inputElement.value = credentials[setting.id]
      loginElement.appendChild(labelElement)
      loginElement.appendChild(inputElement)
      return inputElement
    })

  function hide(element: HTMLDivElement, value: boolean = true): void {
    element.classList.toggle('hidden', value)
  }

  function unhide(element: HTMLDivElement, value: boolean = true): void {
    element.classList.toggle('hidden', !value)
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

  function processSettingValue(
    setting: HTMLInputElement | HTMLSelectElement
  ): any {
    const value: any = setting.value
    const intValue: number = Number.parseInt(value)
    if (!Number.isNaN(intValue)) {
      return setting instanceof HTMLInputElement
        ? int(setting, intValue)
        : intValue
    }
    if (setting instanceof HTMLInputElement && setting.type === 'checkbox') {
      if (!setting.indeterminate) {
        return setting.checked
      }
      return
    }
    return ['true', 'false'].includes(value) ? value === 'true' : value
  }

  function buildSettingsBody(
    settings: Array<HTMLInputElement | HTMLSelectElement>
  ): Settings {
    const shouldUpdate = (settingValue: any, settingId: string): boolean => {
      if (settingValue === undefined) {
        return false
      }
      const deviceSetting: any[] = flatDeviceSettings[settingId]
      return deviceSetting.length !== 1 || settingValue !== deviceSetting[0]
    }

    return settings.reduce<Settings>(
      (body, setting: HTMLInputElement | HTMLSelectElement) => {
        if (setting.value === '') {
          return body
        }
        const settingValue: any = processSettingValue(setting)
        if (shouldUpdate(settingValue, setting.id)) {
          body[setting.id] = settingValue
        }
        return body
      },
      {}
    )
  }

  function updateDeviceSettings(body: Settings): void {
    Object.entries(body).forEach(
      ([settingId, settingValue]: [string, any]): void => {
        Object.values(deviceSettings).forEach(
          (settings: Record<string, any[]>): void => {
            settings[settingId] = [settingValue]
          }
        )
        flatDeviceSettings[settingId] = [settingValue]
      }
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
        updateDeviceSettings(body)
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

  function generateChildrenElements(): void {
    driverSettings
      .filter((setting: DriverSetting): boolean =>
        ['checkbox', 'dropdown'].includes(setting.type)
      )
      .forEach((setting: DriverSetting): void => {
        const divElement: HTMLDivElement = document.createElement('div')
        divElement.className = 'homey-form-group'
        const labelElement = document.createElement('label')
        labelElement.className = 'homey-form-label'
        labelElement.id = `setting-${setting.id}`
        labelElement.innerText = setting.title
        const selectElement = document.createElement('select')
        selectElement.className = 'homey-form-select'
        selectElement.id = setting.id
        labelElement.htmlFor = selectElement.id
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
        const values: any[] = flatDeviceSettings[setting.id]
        if (values.length === 1) {
          selectElement.value = String(values[0])
        }
        divElement.appendChild(labelElement)
        divElement.appendChild(selectElement)
        settingsElement.appendChild(divElement)
      })
    addSettingsEventListener(
      applySettingsElement,
      Array.from(settingsElement.querySelectorAll('select'))
    )
  }

  async function needsAuthentication(value: boolean = true): Promise<void> {
    hide(authenticatedElement, value)
    unhide(authenticatingElement, value)
  }

  async function load(): Promise<void> {
    generateChildrenElements()
    try {
      await login()
    } catch (error: unknown) {
      await needsAuthentication()
    }
  }

  async function login(): Promise<void> {
    const username: string = usernameElement?.value ?? ''
    const password: string = passwordElement?.value ?? ''
    if (username === '' || password === '') {
      authenticateElement.classList.remove('is-disabled')
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
        if (error !== null || !login) {
          authenticateElement.classList.remove('is-disabled')
          // @ts-expect-error bug
          await Homey.alert(
            error !== null
              ? error.message
              : Homey.__('settings.authenticate.failure')
          )
          return
        }
        await needsAuthentication(false)
      }
    )
  }

  authenticateElement.addEventListener('click', (): void => {
    authenticateElement.classList.add('is-disabled')
    void login()
  })

  await load()
}
