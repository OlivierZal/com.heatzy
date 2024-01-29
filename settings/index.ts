/* eslint-disable @typescript-eslint/no-unsafe-call */
import type {
  DeviceSetting,
  DeviceSettings,
  DriverSetting,
  HomeySettingsUI,
  LoginCredentials,
  LoginDriverSetting,
  OnModeSetting,
  Settings,
  ValueOf,
} from '../types'
import type Homey from 'homey/lib/Homey'

// eslint-disable-next-line func-style
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
        '/settings/devices',
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
        (acc, [settingId, settingValues]: [string, ValueOf<Settings>[]]) => {
          if (!(settingId in acc)) {
            acc[settingId] = []
          }
          acc[settingId].push(
            ...settingValues.filter(
              (settingValue: ValueOf<Settings>) =>
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
        '/settings/drivers',
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

  const disableButtons = (value = true): void => {
    ;[applySettingsElement, refreshSettingsElement].forEach(
      (buttonElement: HTMLButtonElement) => {
        if (value) {
          buttonElement.classList.add('is-disabled')
        } else {
          buttonElement.classList.remove('is-disabled')
        }
      },
    )
  }

  const enableButtons = (value = true): void => {
    disableButtons(!value)
  }

  const hide = (element: HTMLDivElement, value = true): void => {
    element.classList.toggle('hidden', value)
  }

  const unhide = (element: HTMLDivElement, value = true): void => {
    hide(element, !value)
  }

  const needsAuthentication = (value = true): void => {
    hide(authenticatedElement, value)
    unhide(authenticatingElement, value)
  }

  const processSettingValue = (
    element: HTMLInputElement | HTMLSelectElement,
  ): ValueOf<Settings> | null => {
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
      : (value as OnModeSetting)
  }

  const buildSettingsBody = (
    elements: (HTMLInputElement | HTMLSelectElement)[],
  ): Settings => {
    const shouldUpdate = (
      settingId: string,
      settingValue: ValueOf<Settings>,
    ): boolean => {
      const deviceSetting: ValueOf<Settings>[] | undefined = flatDeviceSettings[
        settingId
      ] as ValueOf<Settings>[] | undefined
      return (
        typeof deviceSetting !== 'undefined' &&
        (new Set(deviceSetting).size !== 1 || settingValue !== deviceSetting[0])
      )
    }

    return Object.fromEntries(
      elements
        .map(
          (
            element: HTMLInputElement | HTMLSelectElement,
          ): [null] | [string, ValueOf<Settings>] => {
            const settingId: string = element.id.split('--')[0]
            const settingValue: ValueOf<Settings> | null =
              processSettingValue(element)
            return settingValue !== null &&
              shouldUpdate(settingId, settingValue)
              ? [settingId, settingValue]
              : [null]
          },
        )
        .filter(
          (
            entry: [null] | [string, ValueOf<Settings>],
          ): entry is [string, ValueOf<Settings>] => entry[0] !== null,
        ),
    )
  }

  const updateDeviceSettings = (body: Settings): void => {
    Object.entries(body).forEach(
      ([settingId, settingValue]: [string, ValueOf<Settings>]) => {
        Object.keys(deviceSettings).forEach((driver: string) => {
          deviceSettings[driver][settingId] = [settingValue]
        })
        flatDeviceSettings[settingId] = [settingValue]
      },
    )
  }

  const setDeviceSettings = (body: Settings): void => {
    // @ts-expect-error: `homey` is partially typed
    homey.api(
      'PUT',
      '/settings/devices',
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

  const addApplySettingsEventListener = (
    elements: HTMLSelectElement[],
  ): void => {
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

  const updateCommonChildrenElement = (element: HTMLSelectElement): void => {
    const values: ValueOf<Settings>[] | undefined = flatDeviceSettings[
      element.id.split('--')[0]
    ] as ValueOf<Settings>[] | undefined

    element.value =
      values && new Set(values).size === 1 ? String(values[0]) : ''
  }

  const addRefreshSettingsEventListener = (
    elements: HTMLSelectElement[],
  ): void => {
    refreshSettingsElement.addEventListener('click', (): void => {
      disableButtons()
      elements.forEach(updateCommonChildrenElement)
      enableButtons()
    })
  }

  const addSettingsEventListeners = (elements: HTMLSelectElement[]): void => {
    addApplySettingsEventListener(elements)
    addRefreshSettingsEventListener(elements)
  }

  const generateCommonChildrenElements = (): void => {
    driverSettingsCommon
      .filter((setting: DriverSetting) =>
        ['checkbox', 'dropdown'].includes(setting.type),
      )
      .forEach((setting: DriverSetting) => {
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
        ].forEach(({ id, label }: { id: string; label?: string }) => {
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

  const login = async (): Promise<void> => {
    const username: string = usernameElement?.value ?? ''
    const password: string = passwordElement?.value ?? ''
    if (!username || !password) {
      // @ts-expect-error: `homey` is partially typed
      await homey.alert(homey.__('settings.authenticate.failure'))
      return
    }
    const body: LoginCredentials = { password, username }
    // @ts-expect-error: `homey` is partially typed
    homey.api(
      'POST',
      '/sessions',
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

  const load = async (): Promise<void> => {
    generateCommonChildrenElements()
    if (typeof homeySettings.token === 'undefined') {
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
