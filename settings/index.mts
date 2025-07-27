import type { LoginPostData } from '@olivierzal/heatzy-api'
import type Homey from 'homey/lib/HomeySettings'

import type {
  DeviceSetting,
  DeviceSettings,
  DriverSetting,
  HomeySettings,
  Settings,
  ValueOf,
} from '../types.mts'

type HTMLValueElement = HTMLInputElement | HTMLSelectElement

let deviceSettings: Partial<DeviceSettings> = {}
let flatDeviceSettings: Partial<DeviceSetting> = {}

let usernameElement: HTMLInputElement | null = null
let passwordElement: HTMLInputElement | null = null

const getButtonElement = (id: string): HTMLButtonElement => {
  const element = document.querySelector(`#${id}`)
  if (!(element instanceof HTMLButtonElement)) {
    throw new TypeError(`Element with id \`${id}\` is not a button`)
  }
  return element
}

const getDivElement = (id: string): HTMLDivElement => {
  const element = document.querySelector(`#${id}`)
  if (!(element instanceof HTMLDivElement)) {
    throw new TypeError(`Element with id \`${id}\` is not a div`)
  }
  return element
}

const applySettingsElement = getButtonElement('apply_settings_common')
const authenticateElement = getButtonElement('authenticate')
const refreshSettingsElement = getButtonElement('refresh_settings_common')

const authenticatedElement = getDivElement('authenticated')
const authenticatingElement = getDivElement('authenticating')
const loginElement = getDivElement('login')
const settingsCommonElement = getDivElement('settings_common')

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

const disableButton = (element: HTMLButtonElement, value = true): void => {
  if (value) {
    element.classList.add('is-disabled')
    return
  }
  element.classList.remove('is-disabled')
}

const disableButtons = (value = true): void => {
  for (const element of [applySettingsElement, refreshSettingsElement]) {
    disableButton(element, value)
  }
}

const enableButtons = (value = true): void => {
  disableButtons(!value)
}

const withDisablingButtons = async (
  action: () => Promise<void>,
): Promise<void> => {
  disableButtons()
  await action()
  enableButtons()
}

const hide = (element: HTMLDivElement, value = true): void => {
  element.classList.toggle('hidden', value)
}

const unhide = (element: HTMLDivElement, value = true): void => {
  hide(element, !value)
}

const setDocumentLanguage = async (homey: Homey): Promise<void> =>
  new Promise((resolve) => {
    homey.api('GET', '/language', (error: Error | null, language: string) => {
      if (!error) {
        document.documentElement.lang = language
      }
      resolve()
    })
  })

const fetchHomeySettings = async (homey: Homey): Promise<HomeySettings> =>
  new Promise((resolve) => {
    homey.get(async (error: Error | null, settings: HomeySettings) => {
      if (error) {
        await homey.alert(error.message)
        resolve({})
        return
      }
      resolve(settings)
    })
  })

const fetchFlattenDeviceSettings = (): void => {
  flatDeviceSettings = Object.fromEntries(
    Object.entries(
      Object.groupBy(
        Object.values(deviceSettings).flatMap((settings) =>
          Object.entries(settings ?? {}).map(([id, values]) => ({
            id,
            values,
          })),
        ),
        ({ id }) => id,
      ),
    ).map(([id, groupedValues]) => {
      const set = new Set(groupedValues?.map(({ values }) => values))
      return [id, set.size === 1 ? set.values().next().value : null]
    }),
  )
}

const fetchDeviceSettings = async (homey: Homey): Promise<void> =>
  new Promise((resolve) => {
    homey.api(
      'GET',
      '/settings/devices',
      async (error: Error | null, settings: DeviceSettings) => {
        if (error) {
          await homey.alert(error.message)
        } else {
          deviceSettings = settings
          fetchFlattenDeviceSettings()
        }
        resolve()
      },
    )
  })

const createLabelElement = (
  valueElement: HTMLValueElement,
  text: string,
): HTMLLabelElement => {
  const labelElement = document.createElement('label')
  labelElement.classList.add('homey-form-label')
  ;({ id: labelElement.htmlFor } = valueElement)
  labelElement.textContent = text
  labelElement.append(valueElement)
  return labelElement
}

const createDivElement = (labelElement: HTMLLabelElement): HTMLDivElement => {
  const divElement = document.createElement('div')
  divElement.classList.add('homey-form-group')
  divElement.append(labelElement)
  return divElement
}

const createValueElement = (
  parentElement: HTMLElement,
  {
    title,
    valueElement,
  }: { title: string; valueElement: HTMLValueElement | null },
): void => {
  if (valueElement) {
    parentElement.append(
      createDivElement(createLabelElement(valueElement, title)),
    )
  }
}

const createInputElement = ({
  id,
  placeholder,
  type,
  value,
}: {
  id: string
  type: string
  max?: number
  min?: number
  placeholder?: string
  value?: string | null
}): HTMLInputElement => {
  const inputElement = document.createElement('input')
  inputElement.classList.add('homey-form-input')
  inputElement.id = id
  inputElement.value = value ?? ''
  inputElement.type = type
  if (placeholder !== undefined) {
    inputElement.placeholder = placeholder
  }
  return inputElement
}

const createOptionElement = (
  selectElement: HTMLSelectElement,
  { id, label }: { id: string; label: string },
): void => {
  if (
    !selectElement.querySelector<HTMLOptionElement>(`option[value="${id}"]`)
  ) {
    selectElement.append(new Option(label, id))
  }
}

const createSelectElement = (
  homey: Homey,
  id: string,
  values?: readonly { id: string; label: string }[],
): HTMLSelectElement => {
  const selectElement = document.createElement('select')
  selectElement.classList.add('homey-form-select')
  selectElement.id = id
  for (const option of [
    { id: '', label: '' },
    ...(values ??
      ['false', 'true'].map((value) => ({
        id: value,
        label: homey.__(`settings.boolean.${value}`),
      }))),
  ]) {
    createOptionElement(selectElement, option)
  }
  return selectElement
}

const generateCredential = (
  credentialKey: keyof LoginPostData,
  driverSettings: Partial<Record<string, DriverSetting[]>>,
  value?: string | null,
): HTMLInputElement | null => {
  const loginSetting = driverSettings['login']?.find(
    ({ id }) => id === credentialKey,
  )
  if (loginSetting) {
    const { id, placeholder, title, type } = loginSetting
    const valueElement = createInputElement({ id, placeholder, type, value })
    createValueElement(loginElement, { title, valueElement })
    return valueElement
  }
  return null
}

const generateCredentials = (
  driverSettings: Partial<Record<string, DriverSetting[]>>,
  {
    password,
    username,
  }: { password?: string | null; username?: string | null },
): void => {
  usernameElement = generateCredential('username', driverSettings, username)
  passwordElement = generateCredential('password', driverSettings, password)
}

const shouldUpdate = (id: string, value: ValueOf<Settings>): boolean => {
  if (value !== null) {
    const { [id]: setting } = flatDeviceSettings
    return setting === null ? true : value !== setting
  }
  return false
}

const processValue = (element: HTMLSelectElement): ValueOf<Settings> => {
  if (element.value) {
    return ['false', 'true'].includes(element.value) ?
        element.value === 'true'
      : element.value
  }
  return null
}

const setSetting = (settings: Settings, element: HTMLSelectElement): void => {
  const [id] = element.id.split('__')
  if (id !== undefined) {
    const value = processValue(element)
    if (shouldUpdate(id, value)) {
      settings[id] = value
    }
  }
}

const buildSettingsBody = (elements: HTMLSelectElement[]): Settings => {
  const settings: Settings = {}
  const errors: string[] = []
  for (const element of elements) {
    try {
      setSetting(settings, element)
    } catch (error) {
      errors.push(getErrorMessage(error))
    }
  }
  if (errors.length > 0) {
    throw new Error(errors.join('\n') || 'Unknown error')
  }
  return settings
}

const updateDeviceSettings = (body: Settings): void => {
  for (const [id, value] of Object.entries(body)) {
    for (const driver of Object.keys(deviceSettings)) {
      deviceSettings[driver] ??= {}
      deviceSettings[driver][id] = value
    }
    flatDeviceSettings[id] = value
  }
}

const updateCommonSetting = (element: HTMLSelectElement): void => {
  const [id] = element.id.split('__')
  if (id !== undefined) {
    const { [id]: value } = flatDeviceSettings
    element.value =
      ['boolean', 'number', 'string'].includes(typeof value) ?
        String(value)
      : ''
  }
}

const refreshCommonSettings = (elements: HTMLSelectElement[]): void => {
  for (const element of elements) {
    updateCommonSetting(element)
  }
}

const setDeviceSettings = async (
  homey: Homey,
  elements: HTMLSelectElement[],
): Promise<void> => {
  const body = buildSettingsBody(elements)
  if (Object.keys(body).length === 0) {
    refreshCommonSettings(elements)
    homey.alert(homey.__('settings.devices.apply.nothing')).catch(() => {
      //
    })
    return
  }
  await withDisablingButtons(
    async () =>
      new Promise((resolve) => {
        homey.api(
          'PUT',
          '/settings/devices',
          body satisfies Settings,
          async (error: Error | null) => {
            if (!error) {
              updateDeviceSettings(body)
            }
            await homey.alert(
              error ? error.message : homey.__('settings.success'),
            )
            resolve()
          },
        )
      }),
  )
}

const addApplySettingsEventListener = (
  homey: Homey,
  elements: HTMLSelectElement[],
): void => {
  applySettingsElement.addEventListener('click', () => {
    setDeviceSettings(homey, elements).catch(() => {
      //
    })
  })
}

const addRefreshSettingsEventListener = (
  elements: HTMLSelectElement[],
): void => {
  refreshSettingsElement.addEventListener('click', () => {
    refreshCommonSettings(elements)
  })
}

const addSettingsEventListeners = (
  homey: Homey,
  elements: HTMLSelectElement[],
): void => {
  addApplySettingsEventListener(homey, elements)
  addRefreshSettingsEventListener(elements)
}

const generateCommonSettings = (
  homey: Homey,
  driverSettings: Partial<Record<string, DriverSetting[]>>,
): void => {
  for (const { id, title, type, values } of driverSettings['options'] ?? []) {
    const settingId = `${id}__settings`
    if (
      !settingsCommonElement.querySelector(`select[id="${settingId}"]`) &&
      ['checkbox', 'dropdown'].includes(type)
    ) {
      const valueElement = createSelectElement(homey, settingId, values)
      createValueElement(settingsCommonElement, { title, valueElement })
      updateCommonSetting(valueElement)
    }
  }
  addSettingsEventListeners(
    homey,
    // eslint-disable-next-line unicorn/prefer-spread
    Array.from(settingsCommonElement.querySelectorAll('select')),
  )
}

const fetchDriverSettings = async (
  homey: Homey,
  credentials: { password?: string | null; username?: string | null },
): Promise<void> =>
  new Promise((resolve) => {
    homey.api(
      'GET',
      '/settings/drivers',
      async (
        error: Error | null,
        settings: Partial<Record<string, DriverSetting[]>>,
      ) => {
        if (error) {
          await homey.alert(error.message)
        } else {
          generateCommonSettings(homey, settings)
          generateCredentials(settings, credentials)
        }
        resolve()
      },
    )
  })

const needsAuthentication = (value = true): void => {
  hide(authenticatedElement, value)
  unhide(authenticatingElement, value)
}

const login = async (homey: Homey): Promise<void> => {
  const username = usernameElement?.value ?? ''
  const password = passwordElement?.value ?? ''
  if (!username || !password) {
    homey.alert(homey.__('settings.authenticate.failure')).catch(() => {
      //
    })
    return
  }
  await withDisablingButtons(
    async () =>
      new Promise((resolve) => {
        homey.api(
          'POST',
          '/sessions',
          { password, username } satisfies LoginPostData,
          async (error: Error | null, loggedIn: boolean) => {
            if (error || !loggedIn) {
              await homey.alert(
                error ?
                  error.message
                : homey.__('settings.authenticate.failure'),
              )
            } else {
              needsAuthentication(false)
            }
            resolve()
          },
        )
      }),
  )
}

const addAuthenticateEventListener = (homey: Homey): void => {
  authenticateElement.addEventListener('click', () => {
    authenticateElement.classList.add('is-disabled')
    login(homey)
      .catch(async (error: unknown) => {
        await homey.alert(
          error instanceof Error ? error.message : String(error),
        )
      })
      .finally(() => {
        authenticateElement.classList.remove('is-disabled')
      })
  })
}

const load = async (homey: Homey, token?: string | null): Promise<void> => {
  if (token !== undefined) {
    try {
      await login(homey)
      return
    } catch {}
  }
  needsAuthentication()
}

// @ts-expect-error: read by another script in `./index.html`
// eslint-disable-next-line func-style
async function onHomeyReady(homey: Homey): Promise<void> {
  const { password, token, username } = await fetchHomeySettings(homey)
  await setDocumentLanguage(homey)
  await fetchDeviceSettings(homey)
  await fetchDriverSettings(homey, { password, username })
  addAuthenticateEventListener(homey)
  await load(homey, token)
  homey.ready()
}
