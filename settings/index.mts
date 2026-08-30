import type { LoginCredentials } from '@olivierzal/heatzy-api'
import type { DriverSetting } from '@olivierzal/homey-kit/manifest'
import type HomeySettings from 'homey/lib/HomeySettings'
import { getErrorMessage } from '@olivierzal/homey-kit'
import {
  type HTMLValueElement,
  booleanOptions,
  booleanStrings,
  createInput,
  createLabel,
  createSelect,
  getButton,
  getDetails,
  getDiv,
  getFieldset,
} from '@olivierzal/homey-kit/dom'
import {
  homeyApiDelete,
  homeyApiGet,
  homeyApiPost,
  homeyApiPut,
  homeyConfirm,
} from '@olivierzal/homey-kit/settings'
import {
  type DirtyGate,
  createDirtyGate,
  fireAndForget,
  runWebview,
  trySetDocumentLanguage,
  watchWebviewFreshness,
} from '@olivierzal/homey-kit/webview'

import type { AuthenticationResult } from '../types/api.mts'
import type { DeviceSettings, Settings } from '../types/device-settings.mts'

// Runtime floor: esbuild lowers syntax to es2020, but runtime APIs must
// stay ≤ es2023 — no iterator helpers, no Object.groupBy: the Homey
// mobile app requires iOS 16.4 or later (App Store, 2026-08-11) and
// this page only ever gets that system WebKit.

const commonElementTypes = new Set(['checkbox', 'dropdown'])

interface PageContext {
  readonly credentialsGate: DirtyGate
  readonly elements: PageElements
  readonly gate: DirtyGate
  readonly homey: HomeySettings
  readonly state: PageState
}

interface PageElements {
  readonly applySettings: HTMLButtonElement
  readonly authenticate: HTMLButtonElement
  readonly authentication: HTMLDetailsElement
  readonly devices: HTMLFieldSetElement
  readonly login: HTMLFieldSetElement
  readonly refreshSettings: HTMLButtonElement
  readonly resetCredentials: HTMLButtonElement
  readonly settingsCommon: HTMLDivElement
}

interface PageState {
  deviceSettings: DeviceSettings
  flatDeviceSettings: Record<string, unknown>
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

const getPageElements = (): PageElements => ({
  applySettings: getButton('apply_settings_common'),
  authenticate: getButton('authenticate'),
  authentication: getDetails('authentication'),
  devices: getFieldset('devices'),
  login: getFieldset('login'),
  refreshSettings: getButton('refresh_settings_common'),
  resetCredentials: getButton('reset_credentials'),
  settingsCommon: getDiv('settings_common'),
})

const alertMessage = async (
  homey: HomeySettings,
  message: unknown,
): Promise<void> => {
  try {
    await homey.alert(getErrorMessage(message))
  } catch {
    // The alert channel itself is best-effort
  }
}

// The one sanctioned fire-and-forget seam: detach already-started
// work from an event handler, alerting a rejection instead of
// propagating it.
// Freshness breadcrumbs ride the declared boot-error route; a missed
// one is acceptable, so the callback swallows the outcome.
const reportFreshness = (homey: HomeySettings, message: string): void => {
  homey.api(
    'POST',
    '/boot-error',
    { message, name: 'WebviewFreshness' },
    () => {
      // A missed freshness breadcrumb is acceptable.
    },
  )
}

// Iterates every element so the `undefined` narrow is a real branch: a
// `[data-i18n]` selector would guarantee the attribute and leave the
// guard as dead code under the 100% coverage bar.
const translatePage = (homey: HomeySettings): void => {
  for (const element of document.querySelectorAll<HTMLElement>('*')) {
    const key = element.dataset.i18n
    if (key === undefined) {
      continue
    }
    const translation = homey.__(key)
    if (translation !== '' && translation !== key) {
      element.textContent = translation
    }
  }
}

const createGroupElement = (
  parentElement: HTMLElement,
  valueElement: HTMLValueElement,
  title: string,
): void => {
  const divElement = document.createElement('div')
  divElement.classList.add('homey-form-group')
  divElement.append(createLabel(valueElement, title, 'homey-form-label'))
  parentElement.append(divElement)
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

// Identity rides `dataset`, never an encoded id: splitting an id on a
// separator breaks the day a setting id contains it (com.melcloud form).
const settingIdOf = (element: HTMLSelectElement): string | undefined =>
  element.dataset.settingId

const refreshCommonSetting = (
  element: HTMLSelectElement,
  flatDeviceSettings: Record<string, unknown>,
): void => {
  const id = settingIdOf(element)
  if (id !== undefined) {
    const value = flatDeviceSettings[id]
    element.value =
      typeof value === 'boolean' ||
      typeof value === 'number' ||
      typeof value === 'string'
        ? String(value)
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
    return booleanStrings.includes(element.value)
      ? element.value === 'true'
      : element.value
  }
  return null
}

// The select displays a number as its string (refreshCommonSetting), so
// the divergence check must compare against the same view — comparing
// the raw number would arm Apply forever on an untouched form.
const matchesBaseline = (value: unknown, baseline: unknown): boolean =>
  value === (typeof baseline === 'number' ? String(baseline) : baseline)

const buildSettingsBody = ({
  elements,
  state,
}: Pick<PageContext, 'elements' | 'state'>): Settings => {
  const settings: Record<string, unknown> = {}
  for (const element of commonSettingElements(elements)) {
    const id = settingIdOf(element)
    const value = processValue(element)
    if (
      id !== undefined &&
      value !== null &&
      (state.flatDeviceSettings[id] === null ||
        !matchesBaseline(value, state.flatDeviceSettings[id]))
    ) {
      settings[id] = value
    }
  }
  return settings
}

const refreshCommonSettings = (context: PageContext): void => {
  const { elements, gate, state } = context
  for (const element of commonSettingElements(elements)) {
    refreshCommonSetting(element, state.flatDeviceSettings)
  }
  // Repopulating realigns the form with the stored settings — re-evaluate
  // so Apply reflects the freshly pristine state.
  gate.markSaved()
}

const updateDeviceSettings = (state: PageState, body: Settings): void => {
  for (const [id, value] of Object.entries(body)) {
    for (const driverSettings of Object.values(state.deviceSettings)) {
      driverSettings[id] = value
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
    await alertMessage(homey, error)
    return
  }
  updateDeviceSettings(state, body)
  // The just-saved values are the new pristine baseline — snapshot so
  // Apply greys back out until the form diverges again.
  context.gate.markSaved()
  await alertMessage(homey, homey.__('settings.success'))
}

const applyDeviceSettings = async (context: PageContext): Promise<void> => {
  // The gate's `isActionable` arms Apply only on a non-empty body —
  // never re-derive that invariant here.
  const body = buildSettingsBody(context)
  await context.gate.runBusy(async () => pushDeviceSettings(context, body))
}

const generateCredential = (
  { elements }: PageContext,
  driverSettings: Partial<Record<string, DriverSetting[]>>,
  credential: { key: keyof LoginCredentials; value: string | null | undefined },
): HTMLInputElement | null => {
  const loginSetting = driverSettings.login?.find(
    ({ id: settingId }) => settingId === credential.key,
  )
  if (loginSetting === undefined) {
    return null
  }
  const { id, placeholder, title, type } = loginSetting
  const valueElement = createInput({
    className: 'homey-form-input',
    id,
    placeholder,
    type,
    value: credential.value ?? null,
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
    if (!commonElementTypes.has(type)) {
      continue
    }

    // The DOM id (label linkage) stays suffixed to avoid colliding
    // with the page's own ids; the setting identity rides `dataset`.
    const valueElement = createSelect(
      `${id}__settings`,
      values ?? booleanOptions((key) => homey.__(key)),
      'homey-form-select',
    )
    valueElement.dataset.settingId = id
    // Every control feeds the dirty check that gates Apply.
    context.gate.wire([valueElement])
    createGroupElement(elements.settingsCommon, valueElement, title)
    refreshCommonSetting(valueElement, state.flatDeviceSettings)
  }
}

// The credentials section folds once signed in; the device settings
// stay hidden until then, so a signed-out page shows only the
// expanded credentials.
// A settings page has a user in front of it, so a rejection becomes an
// alert rather than the dev-tools surface a widget would use.
const alertRejection =
  (homey: HomeySettings) =>
  (error: unknown): void => {
    fireAndForget(alertMessage(homey, error))
  }

const setAuthenticatedState = (
  elements: PageElements,
  isAuthenticated: boolean,
): void => {
  elements.authentication.open = !isAuthenticated
  elements.devices.hidden = !isAuthenticated
}

// Answers the route's verdict, or `null` once the failure has been
// alerted — keeping the try around the request alone, so nothing the
// caller does afterwards can be mistaken for a transport failure.
const postSession = async (
  homey: HomeySettings,
  credentials: LoginCredentials,
): Promise<AuthenticationResult | null> => {
  try {
    return await homeyApiPost<AuthenticationResult>(
      homey,
      '/sessions',
      credentials,
    )
  } catch (error) {
    await alertMessage(homey, error)
    return null
  }
}

const pushCredentials = async (
  context: PageContext,
  credentials: LoginCredentials,
): Promise<void> => {
  const { elements, homey } = context
  const result = await postSession(homey, credentials)
  if (result === null) {
    return
  }
  setAuthenticatedState(elements, true)
  // Degrading is not going silent. The server accepted the sign-in, so
  // the account stays signed in and the page opens — but the device
  // list the library should have refreshed never arrived, and this
  // alert is the only place the user hears about it.
  if (result.isDeviceListStale) {
    await alertMessage(homey, homey.__('settings.authenticate.staleDevices'))
  }
}

// An empty credential can only produce the failure alert, so sign-in
// arms only when the form could actually sign in; the caller hands
// over initialized consts, so the construction-time recompute may run
// the predicate safely (fields not built yet read as empty — the
// sign-in button starts greyed).
const createCredentialsGate = (
  elements: PageElements,
  state: PageState,
): DirtyGate =>
  createDirtyGate({
    applyElement: elements.authenticate,
    fieldsetElements: [elements.login],
    refreshElements: [elements.resetCredentials],
    isActionable: (): boolean =>
      (state.usernameElement?.value ?? '').trim() !== '' &&
      (state.passwordElement?.value ?? '') !== '',
  })

const authenticate = async (context: PageContext): Promise<void> => {
  const { homey, state } = context
  // Trimmed: mobile autocomplete appends a space after the email.
  const username = (state.usernameElement?.value ?? '').trim()
  const password = state.passwordElement?.value ?? ''
  if (username === '' || password === '') {
    await alertMessage(homey, homey.__('settings.authenticate.failure'))
    return
  }
  await context.credentialsGate.runBusy(async () =>
    pushCredentials(context, { password, username } satisfies LoginCredentials),
  )
}

const pushLogOut = async (context: PageContext): Promise<void> => {
  const { elements, homey, state } = context
  try {
    await homeyApiDelete(homey, '/sessions')
  } catch (error) {
    await alertMessage(homey, error)
    return
  }
  if (state.passwordElement !== null) {
    state.passwordElement.value = ''
  }
  // A programmatic clear fires no input event — re-evaluate by hand so
  // sign-in greys on the emptied form.
  context.credentialsGate.recompute()
  setAuthenticatedState(elements, false)
}

const logOut = async (context: PageContext): Promise<void> => {
  const { homey } = context
  if (
    !(await homeyConfirm(homey, homey.__('settings.authenticate.resetConfirm')))
  ) {
    return
  }
  await context.credentialsGate.runBusy(async () => pushLogOut(context))
}

const refreshFromDeviceUpdate = async (context: PageContext): Promise<void> => {
  await fetchDeviceSettings(context)
  refreshCommonSettings(context)
}

const addEventListeners = (context: PageContext): void => {
  const { elements, homey } = context
  elements.authenticate.addEventListener('click', () => {
    fireAndForget(authenticate(context), alertRejection(homey))
  })
  elements.resetCredentials.addEventListener('click', () => {
    fireAndForget(logOut(context), alertRejection(homey))
  })
  elements.applySettings.addEventListener('click', () => {
    fireAndForget(applyDeviceSettings(context), alertRejection(homey))
  })
  elements.refreshSettings.addEventListener('click', () => {
    refreshCommonSettings(context)
  })
  // Device syncs refresh the grouped values live, like the manual
  // refresh button but without the tap.
  homey.on('deviceupdate', () => {
    fireAndForget(refreshFromDeviceUpdate(context), alertRejection(homey))
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
  context.credentialsGate.wire(
    [state.usernameElement, state.passwordElement].filter(
      (element) => element !== null,
    ),
  )
  await fetchDeviceSettings(context)
  generateCommonSettings(context, driverSettings)
  // Re-evaluate both gates once the sections are built; the credentials
  // pass also re-arms sign-in for prefilled fields.
  context.gate.markSaved()
  context.credentialsGate.markSaved()
}

// Boot check plus the triggers that cover a page outliving it: this
// webview survives an app restart on mobile, so no new document — and
// no boot check — ever happens there.
const startFreshness = async (homey: HomeySettings): Promise<boolean> =>
  watchWebviewFreshness({
    entry: 'settings',
    fetchHashes: async () => homeyApiGet(homey, '/webview-hashes'),
    report: (message) => {
      reportFreshness(homey, message)
    },
    subscribe: (onPoke) => {
      homey.on('webview_hashes_changed', onPoke)
    },
  })

const init = async (homey: HomeySettings): Promise<void> => {
  if (await startFreshness(homey)) {
    return
  }
  const elements = getPageElements()
  const state: PageState = {
    deviceSettings: {},
    flatDeviceSettings: {},
    passwordElement: null,
    usernameElement: null,
  }
  const context: PageContext = {
    credentialsGate: createCredentialsGate(elements, state),
    elements,
    // `elements` and `state` are initialized consts here, so the
    // construction-time recompute may run the predicate safely (an
    // empty state builds an empty body — Apply starts greyed).
    gate: createDirtyGate({
      applyElement: elements.applySettings,
      fieldsetElements: [elements.devices],
      refreshElements: [elements.refreshSettings],
      // Arming through the request builder (com.melcloud widget form):
      // an unchanged or emptied field is omitted from the body, so
      // Apply arms only when pressing it would send something.
      isActionable: (): boolean =>
        Object.keys(buildSettingsBody({ elements, state })).length > 0,
    }),
    homey,
    state,
  }
  await trySetDocumentLanguage(async () =>
    homeyApiGet<string>(homey, '/language'),
  )
  translatePage(homey)
  await buildSections(context)
  addEventListeners(context)
  setAuthenticatedState(
    context.elements,
    await homeyApiGet<boolean>(homey, '/sessions'),
  )
}

// The overlay must end whatever happens: `runWebview` bounds the work
// against a deadline that REJECTS (a hung fetch must surface, not
// resolve into a half-built page) and calls `homey.ready()` either way.
// The failure is alerted AFTER the overlay closes, so the alert is not
// competing with it.
const runPage = async (homey: HomeySettings): Promise<void> => {
  const { error, hasFailed } = await runWebview(homey, init(homey), {
    timeoutMessage: 'Timed out while loading the settings page',
  })
  if (hasFailed) {
    await alertMessage(homey, error)
  }
}

/**
 * Entry point called by the page's inline `onHomeyReady` poll once the
 * bundle global is up (the IIFE `globalName` carries it).
 * @param homey - The Homey settings webview SDK instance.
 */
export const start = (homey: HomeySettings): void => {
  fireAndForget(runPage(homey), alertRejection(homey))
}
