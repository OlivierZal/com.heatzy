import type Homey from 'homey/lib/Homey'
import type {
  DeviceSetting,
  DeviceSettings,
  DriverSetting,
  LoginCredentials,
  Settings,
  SettingValue,
} from '../types'

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
    return new Promise<DeviceSettings>((resolve, reject) => {
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
    return new Promise<DriverSetting[]>((resolve, reject) => {
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

  function flattenDeviceSettings(
    deviceSettings: DeviceSettings
  ): DeviceSetting {
    return Object.values(deviceSettings).reduce<DeviceSetting>(
      (flatDeviceSettings, settings: DeviceSetting) =>
        Object.entries(settings).reduce<DeviceSetting>(
          (merged, [settingId, settingValues]: [string, SettingValue[]]) => {
            const newMerged: DeviceSetting = { ...merged }
            newMerged[settingId] ??= []
            newMerged[settingId].push(
              ...settingValues.filter(
                (settingValue: SettingValue): boolean =>
                  !newMerged[settingId].includes(settingValue)
              )
            )
            return newMerged
          },
          flatDeviceSettings
        ),
      {}
    )
  }

  const deviceSettings: DeviceSettings = await getDeviceSettings()
  const flatDeviceSettings: DeviceSetting =
    flattenDeviceSettings(deviceSettings)

  const allDriverSettings: DriverSetting[] = await getDriverSettings()
  const driverSettings: DriverSetting[] = allDriverSettings.filter(
    (setting: DriverSetting): boolean => setting.groupId !== 'login'
  )

  async function getHomeySettings(): Promise<Settings> {
    return new Promise<Settings>((resolve, reject) => {
      // @ts-expect-error bug
      Homey.get(async (error: Error, settings: Settings): Promise<void> => {
        if (error !== null) {
          // @ts-expect-error bug
          await Homey.alert(error.message)
          reject(error)
          return
        }
        resolve(settings)
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

  const homeySettings: Settings = await getHomeySettings()
  const credentialKeys: string[] = ['username', 'password']
  const [usernameElement, passwordElement]: (HTMLInputElement | null)[] =
    credentialKeys.map((credentialKey: string): HTMLInputElement | null => {
      const driverSetting: DriverSetting | undefined = allDriverSettings.find(
        (setting: DriverSetting): boolean => setting.id === credentialKey
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
      inputElement.value = (homeySettings[driverSetting.id] as string) ?? ''
      inputElement.id = driverSetting.id
      labelElement.htmlFor = inputElement.id
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
    value: number = Number.parseInt(element.value, 10)
  ): number {
    const minValue: number = Number(element.min)
    const maxValue: number = Number(element.max)
    if (Number.isNaN(value) || value < minValue || value > maxValue) {
      // eslint-disable-next-line no-param-reassign
      element.value = ''
      const labelElement: HTMLLabelElement | null = document.querySelector(
        `label[for="${element.id}"]`
      )
      throw new Error(
        Homey.__('settings.int_error', {
          name: Homey.__(labelElement?.innerText ?? ''),
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
      settingValue: SettingValue,
      settingId: string
    ): boolean => {
      if (settingValue !== null) {
        const deviceSetting: SettingValue[] = flatDeviceSettings[settingId]
        return deviceSetting.length !== 1 || settingValue !== deviceSetting[0]
      }
      return false
    }

    return settings.reduce<Settings>(
      (body, element: HTMLInputElement | HTMLSelectElement) => {
        const settingValue: SettingValue = processSettingValue(element)
        const settingId: string = element.id.split('--')[0]
        if (shouldUpdate(settingValue, settingId)) {
          return { ...body, [settingId]: settingValue }
        }
        return body
      },
      {}
    )
  }

  function updateDeviceSettings(body: Settings): void {
    Object.entries(body).forEach(
      ([settingId, settingValue]: [string, SettingValue]): void => {
        Object.keys(deviceSettings).forEach((id: string): void => {
          deviceSettings[id][settingId] = [settingValue]
        })
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
    elements: (HTMLInputElement | HTMLSelectElement)[]
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
    driverSettings.forEach((setting: DriverSetting): void => {
      if (!['checkbox', 'dropdown'].includes(setting.type)) {
        return
      }
      const divElement: HTMLDivElement = document.createElement('div')
      divElement.className = 'homey-form-group'
      const labelElement = document.createElement('label')
      labelElement.className = 'homey-form-label'
      labelElement.innerText = setting.title
      const selectElement = document.createElement('select')
      selectElement.className = 'homey-form-select'
      selectElement.id = `${setting.id}--setting`
      labelElement.htmlFor = selectElement.id
      ;[
        { id: '' },
        ...(setting.type === 'checkbox'
          ? [{ id: 'false' }, { id: 'true' }]
          : setting.values ?? []),
      ].forEach((value: { id: string; label?: string }): void => {
        const { id, label } = value
        const optionElement: HTMLOptionElement =
          document.createElement('option')
        optionElement.value = id
        if (id !== '') {
          optionElement.innerText = label ?? Homey.__(`settings.boolean.${id}`)
        }
        selectElement.appendChild(optionElement)
      })
      const values: SettingValue[] = flatDeviceSettings[setting.id]
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
      password,
    }
    // @ts-expect-error bug
    Homey.api(
      'POST',
      '/login',
      body,
      async (error: Error, loggedIn: boolean): Promise<void> => {
        if (error !== null || !loggedIn) {
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

  async function load(): Promise<void> {
    generateChildrenElements()
    try {
      await login()
    } catch (error: unknown) {
      await needsAuthentication()
    }
  }

  authenticateElement.addEventListener('click', (): void => {
    authenticateElement.classList.add('is-disabled')
    login()
  })

  await load()
}
