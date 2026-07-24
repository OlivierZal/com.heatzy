import type { LoginCredentials } from '@olivierzal/heatzy-api'
import type HomeySettings from 'homey/lib/HomeySettings'

import type { DeviceSettings, Settings } from '../types/device-settings.mts'
import type { DriverSetting } from '../types/driver-settings.mts'
import { getErrorMessage } from '../lib/get-error-message.mts'

// Runtime floor: esbuild lowers syntax to es2020, but runtime APIs must
// stay ≤ es2023 — no iterator helpers, no Object.groupBy (old iOS
// engines are real).

const INIT_TIMEOUT_MS = 10_000

const booleanStrings: readonly string[] = ['false', 'true']

const commonElementTypes = new Set(['checkbox', 'dropdown'])

type HTMLValueElement = HTMLInputElement | HTMLSelectElement

interface PageContext {
  readonly elements: PageElements
  readonly homey: HomeySettings
  readonly state: PageState
}

interface PageElements {
  readonly applySettings: HTMLButtonElement
  readonly authenticate: HTMLButtonElement
  readonly authentication: HTMLDetailsElement
  readonly devices: HTMLFieldSetElement
  readonly login: HTMLDivElement
  readonly refreshSettings: HTMLButtonElement
  readonly resetCredentials: HTMLButtonElement
  readonly settingsCommon: HTMLDivElement
}

interface PageState {
  deviceSettings: DeviceSettings
  flatDeviceSettings: Record<string, unknown>
  isBusy: boolean
  passwordElement: HTMLInputElement | null
  usernameElement: HTMLInputElement | null
}

interface StoredCredentials {
  password?: string | null
  username?: string | null
}

// Mobile keyboards mangle the email username: iOS autocapitalizes and
// autocorrects it, and autocomplete appends a trailing space. The hints
// disable that, and the login path trims what slips through.
const applyCredentialHints = (
  input: HTMLInputElement,
  credentialKey: keyof LoginCredentials,
): void => {
  if (credentialKey === 'password') {
    input.autocomplete = 'current-password'
    return
  }
  input.autocomplete = 'username'
  input.autocapitalize = 'none'
  input.spellcheck = false
}

const getElement = <T extends HTMLElement>(
  id: string,
  elementConstructor: new () => T,
): T => {
  const element = document.querySelector(`#${id}`)
  if (!(element instanceof elementConstructor)) {
    throw new TypeError(`Missing page element: #${id}`)
  }
  return element
}

const getPageElements = (): PageElements => ({
  applySettings: getElement('apply_settings_common', HTMLButtonElement),
  authenticate: getElement('authenticate', HTMLButtonElement),
  authentication: getElement('authentication', HTMLDetailsElement),
  devices: getElement('devices', HTMLFieldSetElement),
  login: getElement('login', HTMLDivElement),
  refreshSettings: getElement('refresh_settings_common', HTMLButtonElement),
  resetCredentials: getElement('reset_credentials', HTMLButtonElement),
  settingsCommon: getElement('settings_common', HTMLDivElement),
})

const homeyApiGet = async <T,>(
  homey: HomeySettings,
  path: string,
): Promise<T> =>
  new Promise((resolve, reject) => {
    homey.api('GET', path, (error: Error | null, result: T) => {
      if (error === null) {
        resolve(result)
        return
      }
      reject(error)
    })
  })

const homeyApiDelete = async (
  homey: HomeySettings,
  path: string,
): Promise<void> =>
  new Promise((resolve, reject) => {
    homey.api('DELETE', path, (error: Error | null) => {
      if (error === null) {
        resolve()
        return
      }
      reject(error)
    })
  })

const homeyApiPost = async (
  homey: HomeySettings,
  path: string,
  body: unknown,
): Promise<void> =>
  new Promise((resolve, reject) => {
    homey.api('POST', path, body, (error: Error | null) => {
      if (error === null) {
        resolve()
        return
      }
      reject(error)
    })
  })

const homeyApiPut = async (
  homey: HomeySettings,
  path: string,
  body: unknown,
): Promise<void> =>
  new Promise((resolve, reject) => {
    homey.api('PUT', path, body, (error: Error | null) => {
      if (error === null) {
        resolve()
        return
      }
      reject(error)
    })
  })

const homeyConfirm = async (
  homey: HomeySettings,
  message: string,
): Promise<boolean> =>
  new Promise((resolve) => {
    homey.confirm(
      message,
      null,
      (error: Error | null, isConfirmed: boolean) => {
        resolve(error === null && isConfirmed)
      },
    )
  })

const alertError = async (
  homey: HomeySettings,
  error: unknown,
): Promise<void> => {
  try {
    await homey.alert(getErrorMessage(error))
  } catch {
    // The alert channel itself is best-effort
  }
}

// The one sanctioned fire-and-forget seam (the lib's shape): detach
// already-started work from an event handler, alerting a rejection
// instead of propagating it.
const fireAndForget = (
  homey: HomeySettings,
  promise: Promise<unknown>,
): void => {
  // eslint-disable-next-line unicorn/prefer-await -- the single fire-and-forget seam: rejections are alerted, never propagated
  promise.catch(async (error: unknown) => alertError(homey, error))
}

const setDocumentLanguage = async (homey: HomeySettings): Promise<void> => {
  try {
    document.documentElement.lang = await homeyApiGet<string>(
      homey,
      '/language',
    )
  } catch {
    // The default page language stands when the fetch fails
  }
}

const translatePage = (homey: HomeySettings): void => {
  for (const element of document.querySelectorAll<HTMLElement>('[data-i18n]')) {
    const key = element.dataset.i18n
    if (key !== undefined) {
      const translation = homey.__(key)
      if (translation !== '' && translation !== key) {
        element.textContent = translation
      }
    }
  }
}

const disableButton = (element: HTMLButtonElement, isDisabled = true): void => {
  // Native `disabled` (not a pointer-events class): it blocks keyboard
  // re-fire (no double POST), greys the control, and is announced to
  // screen readers.
  element.disabled = isDisabled
}

const withDisabledButtons = async (
  elements: readonly HTMLButtonElement[],
  action: () => Promise<void>,
): Promise<void> => {
  for (const element of elements) {
    disableButton(element)
  }
  try {
    await action()
  } finally {
    for (const element of elements) {
      disableButton(element, false)
    }
  }
}

const createLabelElement = (
  valueElement: HTMLValueElement,
  text: string,
): HTMLLabelElement => {
  const labelElement = document.createElement('label')
  labelElement.classList.add('homey-form-label')
  labelElement.htmlFor = valueElement.id
  labelElement.textContent = text
  labelElement.append(valueElement)
  return labelElement
}

const createGroupElement = (
  parentElement: HTMLElement,
  valueElement: HTMLValueElement,
  title: string,
): void => {
  const divElement = document.createElement('div')
  divElement.classList.add('homey-form-group')
  divElement.append(createLabelElement(valueElement, title))
  parentElement.append(divElement)
}

const createInputElement = ({
  id,
  placeholder,
  type,
  value,
}: {
  id: string
  type: string
  placeholder?: string | undefined
  value?: string | null | undefined
}): HTMLInputElement => {
  const inputElement = document.createElement('input')
  inputElement.classList.add('homey-form-input')
  inputElement.id = id
  inputElement.type = type
  inputElement.value = value ?? ''
  if (placeholder !== undefined) {
    inputElement.placeholder = placeholder
  }
  return inputElement
}

const createSelectElement = (
  homey: HomeySettings,
  id: string,
  values?: readonly { id: string; label: string }[],
): HTMLSelectElement => {
  const selectElement = document.createElement('select')
  selectElement.classList.add('homey-form-select')
  selectElement.id = id
  for (const { id: optionValue, label } of [
    { id: '', label: '' },
    ...(values ??
      booleanStrings.map((booleanString) => ({
        id: booleanString,
        label: homey.__(`settings.boolean.${booleanString}`),
      }))),
  ]) {
    selectElement.append(new Option(label, optionValue))
  }
  return selectElement
}

// The grouped view collapses across devices: a setting equal on every
// device shows its value, a divergent one shows blank.
const flattenDeviceSettings = (
  deviceSettings: DeviceSettings,
): Record<string, unknown> => {
  const grouped = new Map<string, Set<unknown>>()
  for (const settings of Object.values(deviceSettings)) {
    for (const [id, value] of Object.entries(settings)) {
      const values = grouped.get(id) ?? new Set()
      values.add(value)
      grouped.set(id, values)
    }
  }
  const flat: Record<string, unknown> = {}
  for (const [id, values] of grouped) {
    flat[id] = values.size === 1 ? [...values][0] : null
  }
  return flat
}

const settingIdOf = (element: HTMLSelectElement): string | undefined =>
  element.id.split('__', 1)[0]

const refreshCommonSetting = (
  element: HTMLSelectElement,
  flatDeviceSettings: Record<string, unknown>,
): void => {
  const id = settingIdOf(element)
  if (id !== undefined) {
    const value = flatDeviceSettings[id]
    element.value =
      (
        typeof value === 'boolean' ||
        typeof value === 'number' ||
        typeof value === 'string'
      ) ?
        String(value)
      : ''
  }
}

const commonSettingElements = (elements: PageElements): HTMLSelectElement[] => [
  ...elements.settingsCommon.querySelectorAll('select'),
]

const fetchDeviceSettings = async ({
  homey,
  state,
}: PageContext): Promise<void> => {
  state.deviceSettings = await homeyApiGet<DeviceSettings>(
    homey,
    '/settings/devices',
  )
  state.flatDeviceSettings = flattenDeviceSettings(state.deviceSettings)
}

const processValue = (element: HTMLSelectElement): unknown => {
  if (element.value !== '') {
    return booleanStrings.includes(element.value) ?
        element.value === 'true'
      : element.value
  }
  return null
}

const buildSettingsBody = ({ elements, state }: PageContext): Settings => {
  const settings: Record<string, unknown> = {}
  for (const element of commonSettingElements(elements)) {
    const id = settingIdOf(element)
    const value = processValue(element)
    if (
      id !== undefined &&
      value !== null &&
      (state.flatDeviceSettings[id] === null ||
        value !== state.flatDeviceSettings[id])
    ) {
      settings[id] = value
    }
  }
  return settings
}

// Apply means something only once the form diverges from the stored
// device settings: an empty delta — or an in-flight request — greys the
// button out. The delta itself is the dirty signal, so no separate
// snapshot is needed.
const updateSettingsDirty = (context: PageContext): void => {
  const isPristine = Object.keys(buildSettingsBody(context)).length === 0
  disableButton(
    context.elements.applySettings,
    context.state.isBusy || isPristine,
  )
}

// A request in flight locks both settings buttons; the dirty recompute
// folds the busy flag in so a control change mid-request cannot
// re-enable Apply.
const setSettingsButtonsBusy = (
  context: PageContext,
  isBusy: boolean,
): void => {
  context.state.isBusy = isBusy
  // Refresh is gated by busy alone, never by the dirty state.
  disableButton(context.elements.refreshSettings, isBusy)
  updateSettingsDirty(context)
}

const withBusySettingsButtons = async (
  context: PageContext,
  action: () => Promise<void>,
): Promise<void> => {
  setSettingsButtonsBusy(context, true)
  try {
    await action()
  } finally {
    setSettingsButtonsBusy(context, false)
  }
}

const refreshCommonSettings = (context: PageContext): void => {
  const { elements, state } = context
  for (const element of commonSettingElements(elements)) {
    refreshCommonSetting(element, state.flatDeviceSettings)
  }
  // Repopulating realigns the form with the stored settings — recompute
  // so Apply reflects the freshly pristine state.
  updateSettingsDirty(context)
}

const updateDeviceSettings = (state: PageState, body: Settings): void => {
  for (const [id, value] of Object.entries(body)) {
    for (const driver of Object.keys(state.deviceSettings)) {
      const driverSettings = state.deviceSettings[driver] ?? {}
      driverSettings[id] = value
      state.deviceSettings[driver] = driverSettings
    }
    state.flatDeviceSettings[id] = value
  }
}

const pushDeviceSettings = async (
  context: PageContext,
  body: Settings,
): Promise<void> => {
  const { homey, state } = context
  try {
    await homeyApiPut(homey, '/settings/devices', body)
  } catch (error) {
    await alertError(homey, error)
    return
  }
  updateDeviceSettings(state, body)
  await alertError(homey, homey.__('settings.success'))
}

const applyDeviceSettings = async (context: PageContext): Promise<void> => {
  const { homey } = context
  const body = buildSettingsBody(context)
  if (Object.keys(body).length === 0) {
    // Defensive: the dirty gating disables Apply on an empty delta, so
    // this is rarely reached — realign the form and report no change.
    refreshCommonSettings(context)
    await alertError(homey, homey.__('settings.devices.apply.nothing'))
    return
  }
  await withBusySettingsButtons(context, async () =>
    pushDeviceSettings(context, body),
  )
}

const generateCredential = (
  { elements }: PageContext,
  driverSettings: Partial<Record<string, DriverSetting[]>>,
  credential: {
    key: keyof LoginCredentials
    value: string | null | undefined
  },
): HTMLInputElement | null => {
  const loginSetting = driverSettings.login?.find(
    ({ id: settingId }) => settingId === credential.key,
  )
  if (loginSetting === undefined) {
    return null
  }
  const { id, placeholder, title, type } = loginSetting
  const valueElement = createInputElement({
    id,
    placeholder,
    type,
    value: credential.value,
  })
  applyCredentialHints(valueElement, credential.key)
  createGroupElement(elements.login, valueElement, title)
  return valueElement
}

const generateCommonSettings = (
  context: PageContext,
  driverSettings: Partial<Record<string, DriverSetting[]>>,
): void => {
  const { elements, homey, state } = context
  const optionSettings = driverSettings.options ?? []
  for (const { id, title, type, values } of optionSettings) {
    const settingId = `${id}__settings`
    if (
      elements.settingsCommon.querySelector(`select#${settingId}`) === null &&
      commonElementTypes.has(type)
    ) {
      const valueElement = createSelectElement(homey, settingId, values)
      // Every control feeds the dirty check that gates Apply.
      valueElement.addEventListener('change', () => {
        updateSettingsDirty(context)
      })
      createGroupElement(elements.settingsCommon, valueElement, title)
      refreshCommonSetting(valueElement, state.flatDeviceSettings)
    }
  }
}

// The credentials section folds once signed in; the device settings
// stay hidden until then (mirrors melcloud's #content gating), so a
// signed-out page shows only the expanded credentials.
const setAuthenticatedState = (
  elements: PageElements,
  isAuthenticated: boolean,
): void => {
  elements.authentication.open = !isAuthenticated
  elements.devices.hidden = !isAuthenticated
}

const pushCredentials = async (
  context: PageContext,
  credentials: LoginCredentials,
): Promise<void> => {
  const { elements, homey } = context
  try {
    await homeyApiPost(homey, '/sessions', credentials)
  } catch (error) {
    await alertError(homey, error)
    return
  }
  setAuthenticatedState(elements, true)
}

const authenticate = async (context: PageContext): Promise<void> => {
  const { elements, homey, state } = context
  // Trimmed: mobile autocomplete appends a space after the email.
  const username = (state.usernameElement?.value ?? '').trim()
  const password = state.passwordElement?.value ?? ''
  if (username === '' || password === '') {
    await alertError(homey, homey.__('settings.authenticate.failure'))
    return
  }
  await withDisabledButtons(
    [elements.authenticate, elements.resetCredentials],
    async () =>
      pushCredentials(context, {
        password,
        username,
      } satisfies LoginCredentials),
  )
}

const pushLogOut = async (context: PageContext): Promise<void> => {
  const { elements, homey, state } = context
  try {
    await homeyApiDelete(homey, '/sessions')
  } catch (error) {
    await alertError(homey, error)
    return
  }
  if (state.passwordElement !== null) {
    state.passwordElement.value = ''
  }
  setAuthenticatedState(elements, false)
}

const logOut = async (context: PageContext): Promise<void> => {
  const { elements, homey } = context
  if (
    !(await homeyConfirm(homey, homey.__('settings.authenticate.resetConfirm')))
  ) {
    return
  }
  await withDisabledButtons(
    [elements.authenticate, elements.resetCredentials],
    async () => pushLogOut(context),
  )
}

const refreshFromDeviceUpdate = async (context: PageContext): Promise<void> => {
  await fetchDeviceSettings(context)
  refreshCommonSettings(context)
}

const addEventListeners = (context: PageContext): void => {
  const { elements, homey } = context
  elements.authenticate.addEventListener('click', () => {
    fireAndForget(homey, authenticate(context))
  })
  elements.resetCredentials.addEventListener('click', () => {
    fireAndForget(homey, logOut(context))
  })
  elements.applySettings.addEventListener('click', () => {
    fireAndForget(homey, applyDeviceSettings(context))
  })
  elements.refreshSettings.addEventListener('click', () => {
    refreshCommonSettings(context)
  })
  // Device syncs refresh the grouped values live, like the manual
  // refresh button but without the tap.
  homey.on('deviceupdate', () => {
    fireAndForget(homey, refreshFromDeviceUpdate(context))
  })
}

// The persisted username/password (the lib's SettingManager writes them
// into homey.settings) so the credential fields show the signed-in
// account instead of empty placeholders.
const fetchStoredCredentials = async (
  homey: HomeySettings,
): Promise<StoredCredentials> =>
  new Promise((resolve) => {
    homey.get((error: Error | null, settings: StoredCredentials | null) => {
      resolve(error === null && settings !== null ? settings : {})
    })
  })

const buildSections = async (context: PageContext): Promise<void> => {
  const { homey, state } = context
  const [driverSettings, credentials] = await Promise.all([
    homeyApiGet<Partial<Record<string, DriverSetting[]>>>(
      homey,
      '/settings/drivers',
    ),
    fetchStoredCredentials(homey),
  ])
  state.usernameElement = generateCredential(context, driverSettings, {
    key: 'username',
    value: credentials.username,
  })
  state.passwordElement = generateCredential(context, driverSettings, {
    key: 'password',
    value: credentials.password,
  })
  await fetchDeviceSettings(context)
  generateCommonSettings(context, driverSettings)
  // Snapshot the pristine state once the sections are built.
  updateSettingsDirty(context)
}

const init = async (homey: HomeySettings): Promise<void> => {
  const context: PageContext = {
    elements: getPageElements(),
    homey,
    state: {
      deviceSettings: {},
      flatDeviceSettings: {},
      isBusy: false,
      passwordElement: null,
      usernameElement: null,
    },
  }
  await setDocumentLanguage(homey)
  translatePage(homey)
  await buildSections(context)
  addEventListeners(context)
  setAuthenticatedState(
    context.elements,
    await homeyApiGet<boolean>(homey, '/sessions'),
  )
}

// Race the work against a deadline that REJECTS (not resolves): a hung
// data fetch must surface an error through the caller's catch, not
// resolve silently into a half-built page. The timer is always cleared.
const withInitTimeout = async (work: Promise<void>): Promise<void> => {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      work,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(new Error('Timed out while loading the settings page'))
        }, INIT_TIMEOUT_MS)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

// The overlay must end whatever happens: a hung fetch rejects through
// the timeout, failures are alerted, and `homey.ready()` runs in the
// finally either way.
const runWebview = async (homey: HomeySettings): Promise<void> => {
  try {
    await withInitTimeout(init(homey))
  } catch (error) {
    await alertError(homey, error)
  } finally {
    homey.ready()
  }
}

/**
 * Entry point called by the page's inline `onHomeyReady` poll once the
 * bundle global is up (the IIFE `globalName` carries it).
 * @param homey - The Homey settings webview SDK instance.
 */
export const start = (homey: HomeySettings): void => {
  fireAndForget(homey, runWebview(homey))
}
