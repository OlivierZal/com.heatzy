/* eslint-disable @typescript-eslint/no-unsafe-call */
import type Homey from 'homey/lib/Homey'
import type {
  OnMode,
  DeviceSetting,
  DeviceSettings,
  DriverSetting,
  HomeySettingsUI,
  LoginCredentials,
  LoginDriverSetting,
  Settings,
  SettingValue,
} from '../types'

async function onHomeyReady(homey: Homey): Promise<void> {
  await homey.ready()

  await new Promise<void>((resolve, reject) => {
    // @ts-expect-error: `homey` is partially typed
    homey.api(
      'GET',
      '/language',
      (error: Error | null, language: string): void => {
        if (error) {
          reject(error)
          return
        }
        document.documentElement.lang = language
        resolve()
      },
    )
  })

  const homeySettings: HomeySettingsUI = await new Promise<HomeySettingsUI>(
    (resolve, reject) => {
      // @ts-expect-error: `homey` is partially typed
      homey.get(
        async (
          error: Error | null,
          settings: HomeySettingsUI,
        ): Promise<void> => {
          if (error) {
            // @ts-expect-error: `homey` is partially typed
            await homey.alert(error.message)
            reject(error)
            return
          }
          resolve(settings)
        },
      )
    },
  )

  const deviceSettings: DeviceSettings = await new Promise<DeviceSettings>(
    (resolve, reject) => {
      // @ts-expect-error: `homey` is partially typed
      homey.api(
        'GET',
        '/devices/settings',
        async (
          error: Error | null,
          settings: DeviceSettings,
        ): Promise<void> => {
          if (error) {
            // @ts-expect-error: `homey` is partially typed
            await homey.alert(error.message)
            reject(error)
            return
          }
          resolve(settings)
        },
      )
    },
  )

  const flatDeviceSettings: DeviceSetting = Object.values(
    deviceSettings,
  ).reduce<DeviceSetting>(
    (flattenedDeviceSettings, settings: DeviceSetting) =>
      Object.entries(settings).reduce<DeviceSetting>(
        (acc, [settingId, settingValues]: [string, SettingValue[]]) => {
          if (!(settingId in acc)) {
            acc[settingId] = []
          }
          acc[settingId].push(
            ...settingValues.filter(
              (settingValue: SettingValue) =>
                !acc[settingId].includes(settingValue),
            ),
          )
          return acc
        },
        flattenedDeviceSettings,
      ),
    {},
  )

  const driverSettingsAll: DriverSetting[] = await new Promise<DriverSetting[]>(
    (resolve, reject) => {
      // @ts-expect-error: `homey` is partially typed
      homey.api(
        'GET',
        '/drivers/settings',
        async (
          error: Error | null,
          driverSettings: DriverSetting[],
        ): Promise<void> => {
          if (error) {
            // @ts-expect-error: `homey` is partially typed
            await homey.alert(error.message)
            reject(error)
            return
          }
          resolve(driverSettings)
        },
      )
    },
  )

  const driverSettingsCommon: DriverSetting[] = driverSettingsAll.reduce<
    DriverSetting[]
  >((acc, setting: DriverSetting) => {
    if (setting.groupId === 'login') {
      return acc
    }
    if (setting.groupId === 'options') {
      if (!acc.some((option: DriverSetting) => option.id === setting.id)) {
        acc.push(setting)
      }
    }
    return acc
  }, [])

  const applySettingsElement: HTMLButtonElement = document.getElementById(
    'apply-settings',
  ) as HTMLButtonElement
  const authenticateElement: HTMLButtonElement = document.getElementById(
    'authenticate',
  ) as HTMLButtonElement
  const refreshSettingsElement: HTMLButtonElement = document.getElementById(
    'refresh-settings',
  ) as HTMLButtonElement

  const authenticatedElement: HTMLDivElement = document.getElementById(
    'authenticated',
  ) as HTMLDivElement
  const authenticatingElement: HTMLDivElement = document.getElementById(
    'authenticating',
  ) as HTMLDivElement
  const loginElement: HTMLDivElement = document.getElementById(
    'login',
  ) as HTMLDivElement
  const settingsElement: HTMLDivElement = document.getElementById(
    'settings',
  ) as HTMLDivElement

  const credentialKeys: (keyof LoginCredentials)[] = ['username', 'password']
  const [usernameElement, passwordElement]: (HTMLInputElement | null)[] =
    credentialKeys.map(
      (credentialKey: keyof LoginCredentials): HTMLInputElement | null => {
        const driverSetting: LoginDriverSetting | undefined =
          driverSettingsAll.find(
            (setting): setting is LoginDriverSetting =>
              setting.id === credentialKey,
          )
        if (!driverSetting) {
          return null
        }
        const { id } = driverSetting
        const divElement: HTMLDivElement = document.createElement('div')
        divElement.classList.add('homey-form-group')
        const labelElement: HTMLLabelElement = document.createElement('label')
        labelElement.classList.add('homey-form-label')
        labelElement.innerText = driverSetting.title
        const inputElement: HTMLInputElement = document.createElement('input')
        inputElement.classList.add('homey-form-input')
        inputElement.type = driverSetting.type
        inputElement.placeholder = driverSetting.placeholder ?? ''
        inputElement.value = homeySettings[id] ?? ''
        inputElement.id = id
        labelElement.htmlFor = inputElement.id
        loginElement.appendChild(labelElement)
        loginElement.appendChild(inputElement)
        return inputElement
      },
    )

  function disableButtons(value = true): void {
    ;[applySettingsElement, refreshSettingsElement].forEach(
      (buttonElement: HTMLButtonElement): void => {
        if (value) {
          buttonElement.classList.add('is-disabled')
        } else {
          buttonElement.classList.remove('is-disabled')
        }
      },
    )
  }

  function enableButtons(value = true): void {
    disableButtons(!value)
  }

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

  function processSettingValue(
    element: HTMLInputElement | HTMLSelectElement,
  ): SettingValue | null {
    const { value } = element
    if (!value) {
      return null
    }
    if (element instanceof HTMLInputElement && element.type === 'checkbox') {
      if (!element.indeterminate) {
        return element.checked
      }
      return null
    }
    return ['true', 'false'].includes(value)
      ? value === 'true'
      : (value as OnMode)
  }

  function buildSettingsBody(
    elements: (HTMLInputElement | HTMLSelectElement)[],
  ): Settings {
    const shouldUpdate = (
      settingId: string,
      settingValue: SettingValue,
    ): boolean => {
      const deviceSetting: SettingValue[] | undefined = flatDeviceSettings[
        settingId
      ] as SettingValue[] | undefined
      return (
        deviceSetting !== undefined &&
        (new Set(deviceSetting).size !== 1 || settingValue !== deviceSetting[0])
      )
    }

    return Object.fromEntries(
      elements
        .map(
          (
            element: HTMLInputElement | HTMLSelectElement,
          ): [null] | [string, SettingValue] => {
            const settingId: string = element.id.split('--')[0]
            const settingValue: SettingValue | null =
              processSettingValue(element)
            return settingValue !== null &&
              shouldUpdate(settingId, settingValue)
              ? [settingId, settingValue]
              : [null]
          },
        )
        .filter(
          (
            entry: [null] | [string, SettingValue],
          ): entry is [string, SettingValue] => entry[0] !== null,
        ),
    )
  }

  function updateDeviceSettings(body: Settings): void {
    Object.entries(body).forEach(
      ([settingId, settingValue]: [string, SettingValue]): void => {
        Object.keys(deviceSettings).forEach((driver: string): void => {
          deviceSettings[driver][settingId] = [settingValue]
        })
        flatDeviceSettings[settingId] = [settingValue]
      },
    )
  }

  function setDeviceSettings(body: Settings): void {
    // @ts-expect-error: `homey` is partially typed
    homey.api(
      'POST',
      '/devices/settings',
      body,
      async (error: Error | null): Promise<void> => {
        if (error) {
          // @ts-expect-error: `homey` is partially typed
          await homey.alert(error.message)
          return
        }
        updateDeviceSettings(body)
        enableButtons()
        // @ts-expect-error: `homey` is partially typed
        await homey.alert(homey.__('settings.success'))
      },
    )
  }

  function addApplySettingsEventListener(elements: HTMLSelectElement[]): void {
    applySettingsElement.addEventListener('click', (): void => {
      let body: Settings = {}
      try {
        body = buildSettingsBody(elements)
      } catch (error: unknown) {
        // @ts-expect-error: `homey` is partially typed
        homey.alert(error instanceof Error ? error.message : String(error))
        return
      }
      if (!Object.keys(body).length) {
        // @ts-expect-error: `homey` is partially typed
        homey.alert(homey.__('settings.devices.apply.nothing'))
        return
      }
      // @ts-expect-error: `homey` is partially typed
      homey.confirm(
        homey.__('settings.devices.apply.confirm'),
        null,
        async (error: Error | null, ok: boolean): Promise<void> => {
          if (error) {
            // @ts-expect-error: `homey` is partially typed
            await homey.alert(error.message)
            return
          }
          if (ok) {
            disableButtons()
            setDeviceSettings(body)
          }
        },
      )
    })
  }

  function updateCommonChildrenElement(element: HTMLSelectElement): void {
    const values: SettingValue[] | undefined = flatDeviceSettings[
      element.id.split('--')[0]
    ] as SettingValue[] | undefined
    // eslint-disable-next-line no-param-reassign
    element.value =
      values && new Set(values).size === 1 ? String(values[0]) : ''
  }

  function addRefreshSettingsEventListener(
    elements: HTMLSelectElement[],
  ): void {
    refreshSettingsElement.addEventListener('click', (): void => {
      disableButtons()
      elements.forEach(updateCommonChildrenElement)
      enableButtons()
    })
  }

  function addSettingsEventListeners(elements: HTMLSelectElement[]): void {
    addApplySettingsEventListener(elements)
    addRefreshSettingsEventListener(elements)
  }

  function generateCommonChildrenElements(): void {
    driverSettingsCommon
      .filter((setting: DriverSetting) =>
        ['checkbox', 'dropdown'].includes(setting.type),
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
          if (id) {
            optionElement.innerText =
              label ?? homey.__(`settings.boolean.${id}`)
          }
          selectElement.appendChild(optionElement)
        })
        updateCommonChildrenElement(selectElement)
        divElement.appendChild(labelElement)
        divElement.appendChild(selectElement)
        settingsElement.appendChild(divElement)
      })
    addSettingsEventListeners(
      Array.from(settingsElement.querySelectorAll('select')),
    )
  }

  async function login(): Promise<void> {
    const username: string = usernameElement?.value ?? ''
    const password: string = passwordElement?.value ?? ''
    if (!username || !password) {
      // @ts-expect-error: `homey` is partially typed
      await homey.alert(homey.__('settings.authenticate.failure'))
      return
    }
    const body: LoginCredentials = {
      username,
      password,
    }
    // @ts-expect-error: `homey` is partially typed
    homey.api(
      'POST',
      '/login',
      body,
      async (error: Error | null, loggedIn: boolean): Promise<void> => {
        if (error) {
          // @ts-expect-error: `homey` is partially typed
          await homey.alert(error.message)
          return
        }
        if (!loggedIn) {
          // @ts-expect-error: `homey` is partially typed
          await homey.alert(homey.__('settings.authenticate.failure'))
          return
        }
        needsAuthentication(false)
      },
    )
  }

  async function load(): Promise<void> {
    generateCommonChildrenElements()
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
        // @ts-expect-error: `homey` is partially typed
        await homey.alert(error.message)
      })
      .finally((): void => {
        authenticateElement.classList.remove('is-disabled')
      })
  })

  await load()
}
