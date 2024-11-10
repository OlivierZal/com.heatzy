import type { LoginPostData } from '@olivierzal/heatzy-api'
import type Homey from 'homey/lib/HomeySettings'

import type {
  DeviceSetting,
  DeviceSettings,
  DriverSetting,
  HomeySettingsUI,
  LoginDriverSetting,
  Settings,
  ValueOf,
} from '../types.mjs'

type HTMLValueElement = HTMLInputElement | HTMLSelectElement

const SIZE_ONE = 1

let homeySettings: HomeySettingsUI = {
  expireAt: '',
  password: '',
  token: '',
  username: '',
}
let driverSettings: Partial<Record<string, DriverSetting[]>> = {}

let deviceSettings: Partial<DeviceSettings> = {}
let flatDeviceSettings: Partial<DeviceSetting> = {}

let usernameElement: HTMLInputElement | null = null
let passwordElement: HTMLInputElement | null = null

const applySettingsElement = document.getElementById(
  'apply_settings_common',
) as HTMLButtonElement
const authenticateElement = document.getElementById(
  'authenticate',
) as HTMLButtonElement
const refreshSettingsElement = document.getElementById(
  'refresh_settings_common',
) as HTMLButtonElement

const authenticatedElement = document.getElementById(
  'authenticated',
) as HTMLDivElement
const authenticatingElement = document.getElementById(
  'authenticating',
) as HTMLDivElement
const loginElement = document.getElementById('login') as HTMLDivElement
const settingsCommonElement = document.getElementById(
  'settings_common',
) as HTMLDivElement

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
  ;[applySettingsElement, refreshSettingsElement].forEach((element) => {
    disableButton(element, value)
  })
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

const fetchHomeySettings = async (homey: Homey): Promise<void> =>
  new Promise((resolve) => {
    homey.get(async (error: Error | null, settings: HomeySettingsUI) => {
      if (error) {
        await homey.alert(error.message)
      } else {
        homeySettings = settings
      }
      resolve()
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
      return [id, set.size === SIZE_ONE ? set.values().next().value : null]
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

const fetchDriverSettings = async (homey: Homey): Promise<void> =>
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
          driverSettings = settings
        }
        resolve()
      },
    )
  })

const createLabelElement = (
  valueElement: HTMLValueElement,
  text: string,
): HTMLLabelElement => {
  const isCheckbox = valueElement.type === 'checkbox'
  const labelElement = document.createElement('label')
  labelElement.classList.add(
    isCheckbox ? 'homey-form-checkbox' : 'homey-form-label',
  )
  ;({ id: labelElement.htmlFor } = valueElement)
  labelElement.innerText = text
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
  value?: string
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
  ;[
    { id: '', label: '' },
    ...(values ??
      ['false', 'true'].map((value) => ({
        id: value,
        label: homey.__(`settings.boolean.${value}`),
      }))),
  ].forEach((option) => {
    createOptionElement(selectElement, option)
  })
  return selectElement
}

const generateCredential = (
  credentialKey: keyof LoginPostData,
): HTMLInputElement | null => {
  const loginSetting = (driverSettings.login as LoginDriverSetting[]).find(
    ({ id }) => id === credentialKey,
  )
  if (loginSetting) {
    const { id, placeholder, title, type } = loginSetting
    const valueElement = createInputElement({
      id,
      placeholder,
      type,
      value: homeySettings[id],
    })
    createValueElement(loginElement, { title, valueElement })
    return valueElement
  }
  return null
}

const fetchCredentials = (): void => {
  ;[usernameElement, passwordElement] = (['username', 'password'] as const).map(
    generateCredential,
  )
}

const shouldUpdate = (id: string, value: ValueOf<Settings>): boolean => {
  if (value !== null) {
    const { [id]: setting } = flatDeviceSettings
    return setting === null ? true : value !== setting
  }
  return false
}

const processValue = (element: HTMLValueElement): ValueOf<Settings> => {
  if (element.value) {
    return ['false', 'true'].includes(element.value) ?
        element.value === 'true'
      : element.value
  }
  return null
}

const buildSettingsBody = (elements: HTMLValueElement[]): Settings => {
  const errors: string[] = []
  const settings: Settings = {}
  elements.forEach((element) => {
    try {
      const [id] = element.id.split('__')
      const value = processValue(element)
      if (shouldUpdate(id, value)) {
        settings[id] = value
      }
    } catch (error) {
      errors.push(getErrorMessage(error))
    }
  })
  if (errors.length) {
    throw new Error(errors.join('\n'))
  }
  return settings
}

const updateDeviceSettings = (body: Settings): void => {
  Object.entries(body).forEach(([id, value]) => {
    Object.keys(deviceSettings).forEach((driver) => {
      deviceSettings[driver] ??= {}
      deviceSettings[driver][id] = value
    })
    flatDeviceSettings[id] = value
  })
}

const updateCommonChildrenElement = (element: HTMLSelectElement): void => {
  const [id] = element.id.split('__')
  const { [id]: value } = flatDeviceSettings
  element.value = value === null ? '' : String(value)
}

const refreshSettingsCommon = (elements: HTMLSelectElement[]): void => {
  elements.forEach(updateCommonChildrenElement)
}

const setDeviceSettings = async (
  homey: Homey,
  elements: HTMLValueElement[],
): Promise<void> => {
  const body = buildSettingsBody(elements)
  if (!Object.keys(body).length) {
    refreshSettingsCommon(elements as HTMLSelectElement[])
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
  elements: HTMLValueElement[],
): void => {
  applySettingsElement.addEventListener('click', () => {
    setDeviceSettings(homey, elements).catch(() => {
      //
    })
  })
}

const addRefreshSettingsEventListener = (
  elements: HTMLValueElement[],
): void => {
  refreshSettingsElement.addEventListener('click', () => {
    refreshSettingsCommon(elements as HTMLSelectElement[])
  })
}

const addSettingsEventListeners = (
  homey: Homey,
  elements: HTMLValueElement[],
): void => {
  addApplySettingsEventListener(homey, elements)
  addRefreshSettingsEventListener(elements)
}

const fetchCommonSettings = (homey: Homey): void => {
  ;(driverSettings.options ?? []).forEach(({ id, title, type, values }) => {
    const settingId = `${id}__setting`
    if (
      !settingsCommonElement.querySelector(`select[id="${settingId}"]`) &&
      ['checkbox', 'dropdown'].includes(type)
    ) {
      const valueElement = createSelectElement(homey, settingId, values)
      createValueElement(settingsCommonElement, { title, valueElement })
      updateCommonChildrenElement(valueElement)
    }
  })
  addSettingsEventListeners(
    homey,
    Array.from(settingsCommonElement.querySelectorAll('select')),
  )
}

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
      .catch(async (err: unknown) => {
        await homey.alert(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        authenticateElement.classList.remove('is-disabled')
      })
  })
}

const load = async (homey: Homey): Promise<void> => {
  if (homeySettings.token !== undefined) {
    try {
      await login(homey)
      return
    } catch {}
  }
  needsAuthentication()
}

// eslint-disable-next-line func-style
async function onHomeyReady(homey: Homey): Promise<void> {
  await setDocumentLanguage(homey)
  await fetchHomeySettings(homey)
  await fetchDeviceSettings(homey)
  await fetchDriverSettings(homey)
  fetchCommonSettings(homey)
  fetchCredentials()
  addAuthenticateEventListener(homey)
  await load(homey)
  homey.ready()
}
