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

const setLanguage = async (homey: Homey): Promise<void> =>
  new Promise<void>((resolve, reject) => {
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

const getHomeySettigs = async (homey: Homey): Promise<HomeySettingsUI> =>
  new Promise<HomeySettingsUI>((resolve, reject) => {
    // @ts-expect-error: `homey` is partially typed
    homey.get(
      async (error: Error | null, settings: HomeySettingsUI): Promise<void> => {
        if (error) {
          // @ts-expect-error: `homey` is partially typed
          await homey.alert(error.message)
          reject(error)
          return
        }
        resolve(settings)
      },
    )
  })

const getDeviceSettings = async (homey: Homey): Promise<DeviceSettings> =>
  new Promise<DeviceSettings>((resolve, reject) => {
    // @ts-expect-error: `homey` is partially typed
    homey.api(
      'GET',
      '/settings/devices',
      async (error: Error | null, settings: DeviceSettings): Promise<void> => {
        if (error) {
          // @ts-expect-error: `homey` is partially typed
          await homey.alert(error.message)
          reject(error)
          return
        }
        resolve(settings)
      },
    )
  })

const flattenDeviceSettings = (deviceSettings: DeviceSettings): DeviceSetting =>
  Object.values(deviceSettings).reduce<DeviceSetting>(
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

const getDriverSettings = async (homey: Homey): Promise<DriverSetting[]> =>
  new Promise<DriverSetting[]>((resolve, reject) => {
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
  })

const getCommonDriverSettings = (
  driverSettings: DriverSetting[],
): DriverSetting[] =>
  driverSettings.reduce<DriverSetting[]>((acc, setting: DriverSetting) => {
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

const createDivElement = (): HTMLDivElement => {
  const divElement: HTMLDivElement = document.createElement('div')
  divElement.classList.add('homey-form-group')
  return divElement
}

const createInputElement = ({
  id,
  placeholder,
  type,
  value,
}: {
  id: string
  placeholder?: string
  type: string
  value?: string
}): HTMLInputElement => {
  const inputElement: HTMLInputElement = document.createElement('input')
  inputElement.classList.add('homey-form-input')
  inputElement.id = id
  inputElement.value = value ?? ''
  inputElement.type = type
  inputElement.placeholder = placeholder ?? ''
  return inputElement
}

const createLabelElement = ({
  id,
  text,
}: {
  id: string
  text: string
}): HTMLLabelElement => {
  const labelElement: HTMLLabelElement = document.createElement('label')
  labelElement.classList.add('homey-form-label')
  labelElement.htmlFor = id
  labelElement.innerText = text
  return labelElement
}

const createCredentialElement = (
  credentialKey: keyof LoginCredentials,
  driverSettings: DriverSetting[],
  homeySettings: HomeySettingsUI,
): HTMLInputElement | null => {
  const driverSetting: LoginDriverSetting | undefined = driverSettings.find(
    (setting): setting is LoginDriverSetting => setting.id === credentialKey,
  )
  if (driverSetting) {
    const divElement: HTMLDivElement = createDivElement()
    const inputElement: HTMLInputElement = createInputElement({
      id: driverSetting.id,
      placeholder: driverSetting.placeholder,
      type: driverSetting.type,
      value: homeySettings[driverSetting.id],
    })
    const labelElement: HTMLLabelElement = createLabelElement({
      id: inputElement.id,
      text: driverSetting.title,
    })
    divElement.appendChild(labelElement)
    divElement.appendChild(inputElement)
    loginElement.appendChild(divElement)
    return inputElement
  }
  return null
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

const shouldUpdate = (
  settingId: string,
  settingValue: ValueOf<Settings>,
  flatDeviceSettings: DeviceSetting,
): boolean => {
  const deviceSetting: ValueOf<Settings>[] | undefined = flatDeviceSettings[
    settingId
  ] as ValueOf<Settings>[] | undefined
  return (
    typeof deviceSetting !== 'undefined' &&
    (new Set(deviceSetting).size !== 1 || settingValue !== deviceSetting[0])
  )
}

const buildSettingsBody = (
  elements: (HTMLInputElement | HTMLSelectElement)[],
  flatDeviceSettings: DeviceSetting,
): Settings =>
  Object.fromEntries(
    elements
      .map(
        (
          element: HTMLInputElement | HTMLSelectElement,
        ): [null] | [string, ValueOf<Settings>] => {
          const settingId: string = element.id.split('--')[0]
          const settingValue: ValueOf<Settings> | null =
            processSettingValue(element)
          return settingValue !== null &&
            shouldUpdate(settingId, settingValue, flatDeviceSettings)
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

const updateDeviceSettings = (
  body: Settings,
  [deviceSettings, flatDeviceSettings]: [DeviceSettings, DeviceSetting],
): void => {
  Object.entries(body).forEach(
    ([settingId, settingValue]: [string, ValueOf<Settings>]) => {
      Object.keys(deviceSettings).forEach((driver: string) => {
        deviceSettings[driver][settingId] = [settingValue]
      })
      flatDeviceSettings[settingId] = [settingValue]
    },
  )
}

const setDeviceSettings = (
  homey: Homey,
  body: Settings,
  [deviceSettings, flatDeviceSettings]: [DeviceSettings, DeviceSetting],
): void => {
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
      updateDeviceSettings(body, [deviceSettings, flatDeviceSettings])
      enableButtons()
      // @ts-expect-error: `homey` is partially typed
      await homey.alert(homey.__('settings.success'))
    },
  )
}

const addApplySettingsEventListener = (
  homey: Homey,
  elements: HTMLSelectElement[],
  [deviceSettings, flatDeviceSettings]: [DeviceSettings, DeviceSetting],
): void => {
  applySettingsElement.addEventListener('click', (): void => {
    let body: Settings = {}
    try {
      body = buildSettingsBody(elements, flatDeviceSettings)
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
          setDeviceSettings(homey, body, [deviceSettings, flatDeviceSettings])
        }
      },
    )
  })
}

const updateCommonChildrenElement = (
  element: HTMLSelectElement,
  flatDeviceSettings: DeviceSetting,
): void => {
  const values: ValueOf<Settings>[] | undefined = flatDeviceSettings[
    element.id.split('--')[0]
  ] as ValueOf<Settings>[] | undefined

  element.value = values && new Set(values).size === 1 ? String(values[0]) : ''
}

const addRefreshSettingsEventListener = (
  elements: HTMLSelectElement[],
  flatDeviceSettings: DeviceSetting,
): void => {
  refreshSettingsElement.addEventListener('click', (): void => {
    disableButtons()
    elements.forEach((element: HTMLSelectElement) => {
      updateCommonChildrenElement(element, flatDeviceSettings)
    })
    enableButtons()
  })
}

const addSettingsEventListeners = (
  homey: Homey,
  elements: HTMLSelectElement[],
  [deviceSettings, flatDeviceSettings]: [DeviceSettings, DeviceSetting],
): void => {
  addApplySettingsEventListener(homey, elements, [
    deviceSettings,
    flatDeviceSettings,
  ])
  addRefreshSettingsEventListener(elements, flatDeviceSettings)
}

const createSelectElement = (
  homey: Homey,
  setting: DriverSetting,
  flatDeviceSettings: DeviceSetting,
): HTMLSelectElement => {
  const selectElement: HTMLSelectElement = document.createElement('select')
  selectElement.classList.add('homey-form-select')
  selectElement.id = `${setting.id}--setting`
  ;[
    { id: '' },
    ...(setting.type === 'checkbox'
      ? [{ id: 'false' }, { id: 'true' }]
      : setting.values ?? []),
  ].forEach(({ id, label }: { id: string; label?: string }) => {
    const optionElement: HTMLOptionElement = document.createElement('option')
    optionElement.value = id
    if (id) {
      optionElement.innerText = label ?? homey.__(`settings.boolean.${id}`)
    }
    selectElement.appendChild(optionElement)
  })
  updateCommonChildrenElement(selectElement, flatDeviceSettings)
  return selectElement
}

const generateCommonChildrenElements = (
  homey: Homey,
  driverSettingsCommon: DriverSetting[],
  [deviceSettings, flatDeviceSettings]: [DeviceSettings, DeviceSetting],
): void => {
  driverSettingsCommon
    .filter((setting: DriverSetting) =>
      ['checkbox', 'dropdown'].includes(setting.type),
    )
    .forEach((setting: DriverSetting) => {
      const divElement: HTMLDivElement = createDivElement()
      const selectElement: HTMLSelectElement = createSelectElement(
        homey,
        setting,
        flatDeviceSettings,
      )
      const labelElement: HTMLLabelElement = createLabelElement({
        id: selectElement.id,
        text: setting.title,
      })
      divElement.appendChild(labelElement)
      divElement.appendChild(selectElement)
      settingsElement.appendChild(divElement)
    })
  addSettingsEventListeners(
    homey,
    Array.from(settingsElement.querySelectorAll('select')),
    [deviceSettings, flatDeviceSettings],
  )
}

const login = async (
  homey: Homey,
  [usernameElement, passwordElement]: (HTMLInputElement | null)[],
): Promise<void> => {
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

const addAuthenticateEventListener = (
  homey: Homey,
  [usernameElement, passwordElement]: (HTMLInputElement | null)[],
): void => {
  authenticateElement.addEventListener('click', (): void => {
    authenticateElement.classList.add('is-disabled')
    login(homey, [usernameElement, passwordElement])
      .catch(async (error: Error): Promise<void> => {
        // @ts-expect-error: `homey` is partially typed
        await homey.alert(error.message)
      })
      .finally((): void => {
        authenticateElement.classList.remove('is-disabled')
      })
  })
}

const load = async (
  homey: Homey,
  homeySettings: HomeySettingsUI,
  [usernameElement, passwordElement]: (HTMLInputElement | null)[],
): Promise<void> => {
  addAuthenticateEventListener(homey, [usernameElement, passwordElement])
  if (typeof homeySettings.token !== 'undefined') {
    try {
      await login(homey, [usernameElement, passwordElement])
      return
    } catch (error: unknown) {
      // Pass
    }
  }
  needsAuthentication()
}

// eslint-disable-next-line func-style
async function onHomeyReady(homey: Homey): Promise<void> {
  await homey.ready()
  await setLanguage(homey)
  const homeySettings: HomeySettingsUI = await getHomeySettigs(homey)
  const deviceSettings: DeviceSettings = await getDeviceSettings(homey)
  const flatDeviceSettings: DeviceSetting =
    flattenDeviceSettings(deviceSettings)
  const driverSettingsAll: DriverSetting[] = await getDriverSettings(homey)
  const driverSettingsCommon: DriverSetting[] =
    getCommonDriverSettings(driverSettingsAll)
  const [usernameElement, passwordElement]: (HTMLInputElement | null)[] = (
    ['username', 'password'] as (keyof LoginCredentials)[]
  ).map((credentialKey: keyof LoginCredentials): HTMLInputElement | null =>
    createCredentialElement(credentialKey, driverSettingsAll, homeySettings),
  )
  generateCommonChildrenElements(homey, driverSettingsCommon, [
    deviceSettings,
    flatDeviceSettings,
  ])
  await load(homey, homeySettings, [usernameElement, passwordElement])
}
