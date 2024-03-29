/* eslint-disable @typescript-eslint/no-unsafe-call */
import type {
  DeviceSetting,
  DeviceSettings,
  DriverSetting,
  HomeySettingsUI,
  LoginDriverSetting,
  OnModeSetting,
  Settings,
  ValueOf,
} from '../types'
import type Homey from 'homey/lib/Homey'
import type { LoginCredentials } from '../heatzy/types'

const NUMBER_1 = 1

let homeySettings: HomeySettingsUI = {
  expireAt: 0,
  password: '',
  token: '',
  username: '',
}
let deviceSettings: DeviceSettings = {}
let flatDeviceSettings: DeviceSetting = {}
let driverSettingsAll: DriverSetting[] = []
let driverSettingsCommon: DriverSetting[] = []
let usernameElement: HTMLInputElement | null = null
let passwordElement: HTMLInputElement | null = null

const applySettingsElement = document.getElementById(
  'apply-settings',
) as HTMLButtonElement
const authenticateElement = document.getElementById(
  'authenticate',
) as HTMLButtonElement
const refreshSettingsElement = document.getElementById(
  'refresh-settings',
) as HTMLButtonElement

const authenticatedElement = document.getElementById(
  'authenticated',
) as HTMLDivElement
const authenticatingElement = document.getElementById(
  'authenticating',
) as HTMLDivElement
const loginElement = document.getElementById('login') as HTMLDivElement
const settingsCommonElement = document.getElementById(
  'settings-common',
) as HTMLDivElement

const disableButtons = (value = true): void => {
  ;[applySettingsElement, refreshSettingsElement].forEach((buttonElement) => {
    if (value) {
      buttonElement.classList.add('is-disabled')
      return
    }
    buttonElement.classList.remove('is-disabled')
  })
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

const setDocumentLanguage = async (homey: Homey): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    // @ts-expect-error: `homey` is partially typed
    homey.api('GET', '/language', (error: Error | null, language: string) => {
      if (error) {
        reject(error)
        return
      }
      document.documentElement.lang = language
      resolve()
    })
  })

const getHomeySettings = async (homey: Homey): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    // @ts-expect-error: `homey` is partially typed
    homey.get(async (error: Error | null, settings: HomeySettingsUI) => {
      if (error) {
        // @ts-expect-error: `homey` is partially typed
        await homey.alert(error.message)
        reject(error)
        return
      }
      homeySettings = settings
      resolve()
    })
  })

const getDeviceSettings = async (homey: Homey): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    // @ts-expect-error: `homey` is partially typed
    homey.api(
      'GET',
      '/settings/devices',
      async (error: Error | null, settings: DeviceSettings) => {
        if (error) {
          // @ts-expect-error: `homey` is partially typed
          await homey.alert(error.message)
          reject(error)
          return
        }
        deviceSettings = settings
        resolve()
      },
    )
  })

const getFlatDeviceSettings = (): void => {
  flatDeviceSettings = Object.values(deviceSettings).reduce<DeviceSetting>(
    (flattenedDeviceSettings, settings) =>
      Object.entries(settings).reduce<DeviceSetting>(
        (acc, [settingId, settingValues]) => {
          if (!(settingId in acc)) {
            acc[settingId] = []
          }
          const values = new Set<ValueOf<Settings>>([
            ...acc[settingId],
            ...settingValues,
          ])
          acc[settingId] = Array.from(values)
          return acc
        },
        flattenedDeviceSettings,
      ),
    {},
  )
}

const getDriverSettingsAll = async (homey: Homey): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    // @ts-expect-error: `homey` is partially typed
    homey.api(
      'GET',
      '/settings/drivers',
      async (error: Error | null, driverSettings: DriverSetting[]) => {
        if (error) {
          // @ts-expect-error: `homey` is partially typed
          await homey.alert(error.message)
          reject(error)
          return
        }
        driverSettingsAll = driverSettings
        resolve()
      },
    )
  })

const getDriverSettings = (): void => {
  driverSettingsCommon = driverSettingsAll.reduce<DriverSetting[]>(
    (acc, setting) => {
      if (setting.groupId === 'login') {
        return acc
      }
      if (setting.groupId === 'options') {
        if (!acc.some((option) => option.id === setting.id)) {
          acc.push(setting)
        }
      }
      return acc
    },
    [],
  )
}

const createDivElement = (): HTMLDivElement => {
  const divElement = document.createElement('div')
  divElement.classList.add('homey-form-group')
  return divElement
}

const createInputElement = ({
  placeholder,
  value,
  id,
  type,
}: {
  placeholder?: string
  value?: string
  id: string
  type: string
}): HTMLInputElement => {
  const inputElement = document.createElement('input')
  inputElement.classList.add('homey-form-input')
  inputElement.id = id
  inputElement.value = value ?? ''
  inputElement.type = type
  if (typeof placeholder !== 'undefined') {
    inputElement.placeholder = placeholder
  }
  return inputElement
}

const createLabelElement = (
  element: HTMLInputElement | HTMLSelectElement,
  { text }: { text: string },
): HTMLLabelElement => {
  const labelElement = document.createElement('label')
  labelElement.classList.add('homey-form-label')
  labelElement.htmlFor = element.id
  labelElement.innerText = text
  return labelElement
}

const updateCredentialElement = (
  credentialKey: keyof LoginCredentials,
): HTMLInputElement | null => {
  const driverSetting = driverSettingsAll.find(
    (setting): setting is LoginDriverSetting => setting.id === credentialKey,
  )
  if (driverSetting) {
    const divElement = createDivElement()
    const inputElement = createInputElement({
      id: driverSetting.id,
      placeholder: driverSetting.placeholder,
      type: driverSetting.type,
      value: homeySettings[driverSetting.id],
    })
    const labelElement = createLabelElement(inputElement, {
      text: driverSetting.title,
    })
    divElement.appendChild(labelElement)
    divElement.appendChild(inputElement)
    loginElement.appendChild(divElement)
    return inputElement
  }
  return null
}

const updateCredentialElements = (): void => {
  ;[usernameElement, passwordElement] = (
    ['username', 'password'] as (keyof LoginCredentials)[]
  ).map(updateCredentialElement)
}

const processSettingValue = (
  element: HTMLInputElement | HTMLSelectElement,
): ValueOf<Settings> | null => {
  if (element.value) {
    if (element instanceof HTMLInputElement && element.type === 'checkbox') {
      if (!element.indeterminate) {
        return element.checked
      }
      return null
    }
    return ['true', 'false'].includes(element.value)
      ? element.value === 'true'
      : (element.value as OnModeSetting)
  }
  return null
}

const shouldUpdate = (
  settingId: string,
  settingValue: ValueOf<Settings>,
): boolean => {
  const deviceSetting = flatDeviceSettings[settingId]
  if (typeof deviceSetting === 'undefined') {
    return false
  }
  if (new Set(deviceSetting).size !== NUMBER_1) {
    return true
  }
  const [deviceSettingValue] = deviceSetting
  return settingValue !== deviceSettingValue
}

const buildSettingsBody = (
  elements: (HTMLInputElement | HTMLSelectElement)[],
): Settings =>
  Object.fromEntries(
    elements
      .map((element) => {
        const [settingId] = element.id.split('--')
        const settingValue = processSettingValue(element)
        return settingValue !== null && shouldUpdate(settingId, settingValue)
          ? [settingId, settingValue]
          : [null]
      })
      .filter((entry): entry is [string, ValueOf<Settings>] => {
        const [key] = entry
        return key !== null
      }),
  )

const updateDeviceSettings = (body: Settings): void => {
  Object.entries(body).forEach(
    ([settingId, settingValue]: [string, ValueOf<Settings>]) => {
      Object.keys(deviceSettings).forEach((driver) => {
        deviceSettings[driver][settingId] = [settingValue]
      })
      flatDeviceSettings[settingId] = [settingValue]
    },
  )
}

const setDeviceSettings = (homey: Homey, body: Settings): void => {
  // @ts-expect-error: `homey` is partially typed
  homey.api('PUT', '/settings/devices', body, async (error: Error | null) => {
    if (error) {
      // @ts-expect-error: `homey` is partially typed
      await homey.alert(error.message)
      return
    }
    updateDeviceSettings(body)
    enableButtons()
    // @ts-expect-error: `homey` is partially typed
    await homey.alert(homey.__('settings.success'))
  })
}

const addApplySettingsEventListener = (
  homey: Homey,
  elements: HTMLSelectElement[],
): void => {
  applySettingsElement.addEventListener('click', () => {
    let body: Settings = {}
    try {
      body = buildSettingsBody(elements)
    } catch (error) {
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
      async (error: Error | null, ok: boolean) => {
        if (error) {
          // @ts-expect-error: `homey` is partially typed
          await homey.alert(error.message)
          return
        }
        if (ok) {
          disableButtons()
          setDeviceSettings(homey, body)
        }
      },
    )
  })
}

const updateCommonChildrenElement = (element: HTMLSelectElement): void => {
  const [settingId] = element.id.split('--')
  const values = flatDeviceSettings[settingId] as
    | ValueOf<Settings>[]
    | undefined
  if (values && new Set(values).size === NUMBER_1) {
    const [value] = values
    element.value = String(value)
    return
  }
  element.value = ''
}

const addRefreshSettingsEventListener = (
  elements: HTMLSelectElement[],
): void => {
  refreshSettingsElement.addEventListener('click', () => {
    disableButtons()
    elements.forEach(updateCommonChildrenElement)
    enableButtons()
  })
}

const addSettingsEventListeners = (
  homey: Homey,
  elements: HTMLSelectElement[],
): void => {
  addApplySettingsEventListener(homey, elements)
  addRefreshSettingsEventListener(elements)
}

const createSelectElement = (
  homey: Homey,
  setting: DriverSetting,
): HTMLSelectElement => {
  const selectElement = document.createElement('select')
  selectElement.classList.add('homey-form-select')
  selectElement.id = `${setting.id}--setting`
  ;[
    { id: '' },
    ...(setting.type === 'checkbox'
      ? ['false', 'true'].map((id) => ({
          id,
          label: homey.__(`settings.boolean.${id}`),
        }))
      : setting.values ?? []),
  ].forEach(({ id, label }: { label?: string; id: string }) => {
    const optionElement = document.createElement('option')
    optionElement.value = id
    if (typeof label !== 'undefined') {
      optionElement.innerText = label
    }
    selectElement.appendChild(optionElement)
  })
  updateCommonChildrenElement(selectElement)
  return selectElement
}

const generateCommonChildrenElements = (homey: Homey): void => {
  driverSettingsCommon.forEach((setting) => {
    if (['checkbox', 'dropdown'].includes(setting.type)) {
      const divElement = createDivElement()
      const selectElement = createSelectElement(homey, setting)
      const labelElement = createLabelElement(selectElement, {
        text: setting.title,
      })
      divElement.appendChild(labelElement)
      divElement.appendChild(selectElement)
      settingsCommonElement.appendChild(divElement)
    }
  })
  addSettingsEventListeners(
    homey,
    Array.from(settingsCommonElement.querySelectorAll('select')),
  )
}

const login = async (homey: Homey): Promise<void> => {
  const username = usernameElement?.value ?? ''
  const password = passwordElement?.value ?? ''
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
    async (error: Error | null, loggedIn: boolean) => {
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

const addAuthenticateEventListener = (homey: Homey): void => {
  authenticateElement.addEventListener('click', () => {
    authenticateElement.classList.add('is-disabled')
    login(homey)
      .catch(async (error: unknown) => {
        // @ts-expect-error: `homey` is partially typed
        await homey.alert(
          error instanceof Error ? error.message : String(error),
        )
      })
      .finally(() => {
        authenticateElement.classList.remove('is-disabled')
      })
  })
}

const load = async (homey: Homey): Promise<void> => {
  addAuthenticateEventListener(homey)
  if (typeof homeySettings.token === 'undefined') {
    needsAuthentication()
    return
  }
  try {
    await login(homey)
  } catch (error) {
    needsAuthentication()
  }
}

// eslint-disable-next-line func-style
async function onHomeyReady(homey: Homey): Promise<void> {
  await homey.ready()
  await setDocumentLanguage(homey)
  await getHomeySettings(homey)
  await getDeviceSettings(homey)
  getFlatDeviceSettings()
  await getDriverSettingsAll(homey)
  getDriverSettings()
  updateCredentialElements()
  generateCommonChildrenElements(homey)
  await load(homey)
}
