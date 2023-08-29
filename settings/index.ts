import type Homey from 'homey/lib/Homey'
import type {
  DeviceSetting,
  DeviceSettings,
  DriverSetting,
  LoginCredentials,
  Settings,
  SettingValue,
} from '../types'

async function onHomeyReady(homey: Homey): Promise<void> {
  await homey.ready()

  await new Promise<string>((resolve, reject) => {
    // @ts-expect-error: homey is partially typed
    homey.api(
      'GET',
      '/language',
      (error: Error | null, language: string): void => {
        if (error !== null) {
          reject(error)
          return
        }
        document.documentElement.lang = language
        resolve(language)
      }
    )
  })

  async function getHomeySettings(): Promise<Settings> {
    return new Promise<Settings>((resolve, reject) => {
      // @ts-expect-error: homey is partially typed
      homey.get(
        async (error: Error | null, settings: Settings): Promise<void> => {
          if (error !== null) {
            // @ts-expect-error: homey is partially typed
            await homey.alert(error.message)
            reject(error)
            return
          }
          resolve(settings)
        }
      )
    })
  }

  async function getDeviceSettings(): Promise<DeviceSettings> {
    return new Promise<DeviceSettings>((resolve, reject) => {
      // @ts-expect-error: homey is partially typed
      homey.api(
        'GET',
        '/devices/settings',
        async (
          error: Error | null,
          deviceSettings: DeviceSettings
        ): Promise<void> => {
          if (error !== null) {
            // @ts-expect-error: homey is partially typed
            await homey.alert(error.message)
            reject(error)
            return
          }
          resolve(deviceSettings)
        }
      )
    })
  }

  async function getDriverSettings(): Promise<DriverSetting[]> {
    return new Promise<DriverSetting[]>((resolve, reject) => {
      // @ts-expect-error: homey is partially typed
      homey.api(
        'GET',
        '/drivers/settings',
        async (
          error: Error | null,
          driverSettings: DriverSetting[]
        ): Promise<void> => {
          if (error !== null) {
            // @ts-expect-error: homey is partially typed
            await homey.alert(error.message)
            reject(error)
            return
          }
          resolve(driverSettings)
        }
      )
    })
  }

  function flattenDeviceSettings(
    deviceSettings: DeviceSettings
  ): DeviceSetting {
    return Object.values(deviceSettings).reduce<DeviceSetting>(
      (flatDeviceSettings, settings: DeviceSetting) =>
        Object.entries(settings).reduce<DeviceSetting>(
          (acc, [settingId, settingValues]: [string, SettingValue[]]) => {
            if (!(settingId in acc)) {
              acc[settingId] = []
            }
            acc[settingId].push(
              ...settingValues.filter(
                (settingValue: SettingValue) =>
                  !acc[settingId].includes(settingValue)
              )
            )
            return acc
          },
          flatDeviceSettings
        ),
      {}
    )
  }

  const homeySettings: Settings = await getHomeySettings()

  const deviceSettings: DeviceSettings = await getDeviceSettings()
  const flatDeviceSettings: DeviceSetting =
    flattenDeviceSettings(deviceSettings)

  const driverSettingsAll: DriverSetting[] = await getDriverSettings()
  const driverSettings: DriverSetting[] = driverSettingsAll.filter(
    (setting: DriverSetting) => setting.groupId !== 'login'
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
  const loginElement: HTMLDivElement = document.getElementById(
    'login'
  ) as HTMLDivElement
  const settingsElement: HTMLDivElement = document.getElementById(
    'settings'
  ) as HTMLDivElement

  const [usernameElement, passwordElement]: (HTMLInputElement | null)[] = [
    'username',
    'password',
  ].map((credentialKey: string): HTMLInputElement | null => {
    const driverSetting: DriverSetting | undefined = driverSettingsAll.find(
      (setting: DriverSetting) => setting.id === credentialKey
    )
    if (driverSetting === undefined) {
      return null
    }
    const divElement: HTMLDivElement = document.createElement('div')
    divElement.classList.add('homey-form-group')
    const labelElement: HTMLLabelElement = document.createElement('label')
    labelElement.classList.add('homey-form-label')
    labelElement.innerText = driverSetting.title
    const inputElement: HTMLInputElement = document.createElement('input')
    inputElement.classList.add('homey-form-input')
    inputElement.type = driverSetting.type
    inputElement.placeholder = driverSetting.placeholder ?? ''
    inputElement.value =
      (homeySettings[driverSetting.id] as string | undefined) ?? ''
    inputElement.id = driverSetting.id
    labelElement.htmlFor = inputElement.id
    loginElement.appendChild(labelElement)
    loginElement.appendChild(inputElement)
    return inputElement
  })

  function hide(element: HTMLDivElement, value = true): void {
    element.classList.toggle('hidden', value)
  }

  function unhide(element: HTMLDivElement, value = true): void {
    hide(element, !value)
  }

  function needsAuthentication(value = true): void {
    hide(authenticatedElement, value)
    unhide(authenticatingElement, value)
  }

  function int(
    element: HTMLInputElement,
    value: number = Number.parseInt(element.value, 10)
  ): number {
    const minValue = Number(element.min)
    const maxValue = Number(element.max)
    if (Number.isNaN(value) || value < minValue || value > maxValue) {
      element.value = '' // eslint-disable-line no-param-reassign
      const labelElement: HTMLLabelElement | null = document.querySelector(
        `label[for="${element.id}"]`
      )
      throw new Error(
        homey.__('settings.int_error', {
          name: homey.__(labelElement?.innerText ?? ''),
          min: minValue,
          max: maxValue,
        })
      )
    }
    return value
  }

  function processSettingValue(
    setting: HTMLInputElement | HTMLSelectElement
  ): SettingValue {
    const { value } = setting
    if (value === '') {
      return null
    }
    const intValue: number = Number.parseInt(value, 10)
    if (!Number.isNaN(intValue)) {
      return setting instanceof HTMLInputElement
        ? int(setting, intValue)
        : intValue
    }
    if (setting instanceof HTMLInputElement && setting.type === 'checkbox') {
      if (!setting.indeterminate) {
        return setting.checked
      }
      return null
    }
    return ['true', 'false'].includes(value) ? value === 'true' : value
  }

  function buildSettingsBody(
    settings: (HTMLInputElement | HTMLSelectElement)[]
  ): Settings {
    const shouldUpdate = (
      settingId: string,
      settingValue: SettingValue
    ): boolean => {
      if (settingValue !== null) {
        const deviceSetting: SettingValue[] | undefined = flatDeviceSettings[
          settingId
        ] as SettingValue[] | undefined
        return (
          deviceSetting !== undefined &&
          (deviceSetting.length !== 1 || settingValue !== deviceSetting[0])
        )
      }
      return false
    }

    return Object.fromEntries(
      settings
        .map(
          (
            element: HTMLInputElement | HTMLSelectElement
          ): [string, SettingValue] | [null] => {
            const settingId: string = element.id.split('--')[0]
            const settingValue: SettingValue = processSettingValue(element)
            return shouldUpdate(settingId, settingValue)
              ? [settingId, settingValue]
              : [null]
          }
        )
        .filter(
          ([settingId]: [string, SettingValue] | [null]) => settingId !== null
        )
    )
  }

  function updateDeviceSettings(body: Settings): void {
    Object.entries(body).forEach(
      ([settingId, settingValue]: [string, SettingValue]): void => {
        Object.keys(deviceSettings).forEach((driver: string): void => {
          deviceSettings[driver][settingId] = [settingValue]
        })
        flatDeviceSettings[settingId] = [settingValue]
      }
    )
  }

  function setDeviceSettings(
    buttonElement: HTMLButtonElement,
    body: Settings
  ): void {
    // @ts-expect-error: homey is partially typed
    homey.api(
      'POST',
      '/devices/settings',
      body,
      async (error: Error | null): Promise<void> => {
        if (error !== null) {
          // @ts-expect-error: homey is partially typed
          await homey.alert(error.message)
          return
        }
        updateDeviceSettings(body)
        buttonElement.classList.remove('is-disabled')
        // @ts-expect-error: homey is partially typed
        await homey.alert(homey.__('settings.success'))
      }
    )
  }

  function addSettingsEventListener(
    buttonElement: HTMLButtonElement,
    elements: (HTMLInputElement | HTMLSelectElement)[]
  ): void {
    buttonElement.addEventListener('click', (): void => {
      let body: Settings = {}
      try {
        body = buildSettingsBody(elements)
      } catch (error: unknown) {
        // @ts-expect-error: homey is partially typed
        homey.alert(error instanceof Error ? error.message : String(error))
        return
      }
      if (Object.keys(body).length === 0) {
        // @ts-expect-error: homey is partially typed
        homey.alert(homey.__('settings.devices.apply.nothing'))
        return
      }
      // @ts-expect-error: homey is partially typed
      homey.confirm(
        homey.__('settings.devices.apply.confirm'),
        null,
        async (error: Error | null, ok: boolean): Promise<void> => {
          if (error !== null) {
            // @ts-expect-error: homey is partially typed
            await homey.alert(error.message)
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
      .filter((setting: DriverSetting) =>
        ['checkbox', 'dropdown'].includes(setting.type)
      )
      .forEach((setting: DriverSetting): void => {
        const divElement: HTMLDivElement = document.createElement('div')
        divElement.className = 'homey-form-group'
        const labelElement: HTMLLabelElement = document.createElement('label')
        labelElement.className = 'homey-form-label'
        labelElement.innerText = setting.title
        const selectElement: HTMLSelectElement =
          document.createElement('select')
        selectElement.className = 'homey-form-select'
        selectElement.id = `${setting.id}--setting`
        labelElement.htmlFor = selectElement.id
        ;[
          { id: '' },
          ...(setting.type === 'checkbox'
            ? [{ id: 'false' }, { id: 'true' }]
            : setting.values ?? []),
        ].forEach(({ id, label }: { id: string; label?: string }): void => {
          const optionElement: HTMLOptionElement =
            document.createElement('option')
          optionElement.value = id
          if (id !== '') {
            optionElement.innerText =
              label ?? homey.__(`settings.boolean.${id}`)
          }
          selectElement.appendChild(optionElement)
        })
        const values: SettingValue[] | undefined = flatDeviceSettings[
          setting.id
        ] as SettingValue[] | undefined
        if (values !== undefined && values.length === 1) {
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

  async function login(): Promise<void> {
    const username: string = usernameElement?.value ?? ''
    const password: string = passwordElement?.value ?? ''
    if (username === '' || password === '') {
      // @ts-expect-error: homey is partially typed
      await homey.alert(homey.__('settings.authenticate.failure'))
      return
    }
    const body: LoginCredentials = {
      username,
      password,
    }
    // @ts-expect-error: homey is partially typed
    homey.api(
      'POST',
      '/login',
      body,
      async (_: Error | null, loggedIn: boolean): Promise<void> => {
        if (!loggedIn) {
          // @ts-expect-error: homey is partially typed
          await homey.alert(homey.__('settings.authenticate.failure'))
          return
        }
        needsAuthentication(false)
      }
    )
  }

  async function load(): Promise<void> {
    generateChildrenElements()
    if (homeySettings.token === undefined) {
      needsAuthentication()
      return
    }
    try {
      await login()
    } catch (error: unknown) {
      needsAuthentication()
    }
  }

  authenticateElement.addEventListener('click', (): void => {
    authenticateElement.classList.add('is-disabled')
    login()
      .catch(async (error: Error): Promise<void> => {
        // @ts-expect-error: homey is partially typed
        await homey.alert(error.message)
      })
      .finally((): void => {
        authenticateElement.classList.remove('is-disabled')
      })
  })

  await load()
}
