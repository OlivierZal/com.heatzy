// @vitest-environment happy-dom
// @vitest-environment-options {"settings": {"disableCSSFileLoading": true, "disableJavaScriptFileLoading": true, "navigation": {"disableMainFrameNavigation": true}}}

import { readFileSync } from 'node:fs'

import type { DriverSetting } from '@olivierzal/homey-kit/manifest'
import type HomeySettings from 'homey/lib/HomeySettings'
import {
  getButton,
  getDetails,
  getFieldset,
  getInput,
} from '@olivierzal/homey-kit/dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { DeviceSettings } from '../../types/device-settings.mts'
import { start } from '../../settings/index.mts'
import { mock, settleDetached } from '../helpers.ts'

// A plain relative path: under the happy-dom environment
// `import.meta.url` is an http URL the fs module refuses.
const pageHtml = readFileSync('settings/index.html', 'utf8')

type ApiCallback = (error: Error | null, result: unknown) => void

interface Harness {
  readonly alert: ReturnType<typeof vi.fn>
  readonly api: ReturnType<typeof vi.fn>
  readonly homey: HomeySettings
  readonly ready: ReturnType<typeof vi.fn>
  readonly routes: Record<string, unknown>
  readonly emit: (event: string) => void
}

interface HomeyOptions {
  readonly confirmError?: Error | null
  readonly failures?: Readonly<Record<string, Error>>
  readonly isConfirmed?: boolean
  readonly routes?: Record<string, unknown>
  readonly shouldRejectAlerts?: boolean
  readonly storedCredentials?: Record<string, unknown> | null
  readonly storedError?: Error | null
  readonly translations?: Readonly<Record<string, string>>
}

// The wording an element shows, whitespace-collapsed the way HTML
// renders it: the markup's own spacing is Prettier's to choose, so only
// the words are a contract the page owes.
const shownText = (selector: string): string | undefined =>
  document.querySelector(selector)?.textContent.replaceAll(/\s+/gv, ' ').trim()

const driverSettingsFixture = (): Partial<Record<string, DriverSetting[]>> => ({
  login: [
    {
      driverId: 'heatzy',
      driverLabel: 'Heatzy',
      groupId: 'login',
      id: 'username',
      placeholder: 'user@example.com',
      title: 'Email',
      type: 'text',
    },
    {
      driverId: 'heatzy',
      driverLabel: 'Heatzy',
      groupId: 'login',
      id: 'password',
      title: 'Password',
      type: 'password',
    },
  ],
  options: [
    {
      driverId: 'heatzy',
      driverLabel: 'Heatzy',
      id: 'always_on',
      title: 'Always on',
      type: 'checkbox',
    },
    {
      driverId: 'heatzy',
      driverLabel: 'Heatzy',
      id: 'on_mode',
      title: 'On mode',
      type: 'dropdown',
      values: [
        { id: 'previous', label: 'Previous' },
        { id: 'cft', label: 'Comfort' },
      ],
    },
    {
      driverId: 'heatzy',
      driverLabel: 'Heatzy',
      id: 'temp_limit',
      title: 'Temperature limit',
      type: 'dropdown',
      values: [
        { id: '15', label: '15' },
        { id: '16', label: '16' },
      ],
    },
    {
      driverId: 'heatzy',
      driverLabel: 'Heatzy',
      id: 'notes',
      title: 'Notes',
      type: 'label',
    },
  ],
})

const deviceSettingsFixture = (): DeviceSettings => ({
  glow: { always_on: true, on_mode: 'cft', temp_limit: 15 },
  heatzy: { always_on: true, on_mode: 'previous', temp_limit: 15 },
})

// The SDK api overloads GET/DELETE (3 args) with POST/PUT (4): the mock
// mirrors that shape through a rest tuple and picks the trailing
// callback, whichever slot it landed in.
type ApiCallArgs = readonly [string, string, ...unknown[]]

const createApiMock = (
  failures: Readonly<Record<string, Error>>,
  routes: Record<string, unknown>,
): ReturnType<typeof vi.fn> =>
  vi.fn<(...callArgs: ApiCallArgs) => void>((...callArgs) => {
    const [method, path] = callArgs
    const callback = callArgs.findLast(
      (argument): argument is ApiCallback => typeof argument === 'function',
    )
    const key = `${method} ${path}`
    const failure = failures[key]
    if (failure === undefined) {
      callback?.(null, routes[key])
      return
    }
    callback?.(failure, null)
  })

const createAlertMock = (
  shouldRejectAlerts: boolean,
): ReturnType<typeof vi.fn<() => Promise<void>>> =>
  shouldRejectAlerts
    ? vi
        .fn<() => Promise<void>>()
        .mockRejectedValue(new Error('alert channel down'))
    : vi.fn<() => Promise<void>>().mockResolvedValue(undefined)

const createHarness = (options: HomeyOptions = {}): Harness => {
  const {
    confirmError = null,
    failures = {},
    isConfirmed = true,
    routes = {},
    shouldRejectAlerts = false,
    storedCredentials = {},
    storedError = null,
    translations = {},
  } = options
  const listeners = new Map<string, ((...args: unknown[]) => void)[]>()
  const api = createApiMock(failures, routes)
  const alert = createAlertMock(shouldRejectAlerts)
  const ready = vi.fn<() => void>()
  const homey = mock<HomeySettings>({
    alert,
    api,
    ready,
    __: (key: string): string => translations[key] ?? key,
    confirm: (
      _message: string,
      _icon: string | null,
      callback: (error: Error | null, result: boolean) => void,
    ): void => {
      callback(confirmError, isConfirmed)
    },
    get: (callback: (error: Error | null, settings: unknown) => void): void => {
      callback(storedError, storedCredentials)
    },
    on: (event: string, listener: (...args: unknown[]) => void): void => {
      const bucket = listeners.get(event) ?? []
      bucket.push(listener)
      listeners.set(event, bucket)
    },
  })
  return {
    alert,
    api,
    homey,
    ready,
    routes,
    emit: (event: string): void => {
      const bucket = listeners.get(event)
      if (bucket !== undefined) {
        for (const listener of bucket) {
          listener()
        }
      }
    },
  }
}

const defaultRoutes = (): Record<string, unknown> => ({
  'DELETE /sessions': undefined,
  'GET /language': 'fr',
  'GET /sessions': true,
  'GET /settings/devices': deviceSettingsFixture(),
  'GET /settings/drivers': driverSettingsFixture(),
  'GET /webview-hashes': {},
  'POST /boot-error': undefined,
  'POST /sessions': { isDeviceListStale: false },
  'PUT /settings/devices': undefined,
})

const bootPage = async (options: HomeyOptions = {}): Promise<Harness> => {
  const harness = createHarness({ routes: defaultRoutes(), ...options })
  start(harness.homey)
  await settleDetached()
  await settleDetached()
  return harness
}

const settingSelect = (settingId: string): HTMLSelectElement => {
  const element = document.querySelector(
    `select[data-setting-id="${CSS.escape(settingId)}"]`,
  )
  if (element instanceof HTMLSelectElement) {
    return element
  }
  throw new TypeError(`No generated select for setting \`${settingId}\``)
}

interface HTMLValueElementLike extends HTMLElement {
  value: string
}

const commit = (element: HTMLValueElementLike, value: string): void => {
  element.value = value
  element.dispatchEvent(new Event('change', { bubbles: true }))
}

const applyButton = (): HTMLButtonElement => getButton('apply_settings_common')

const authenticateButton = (): HTMLButtonElement => getButton('authenticate')

const resetButton = (): HTMLButtonElement => getButton('reset_credentials')

const devicesFieldset = (): HTMLFieldSetElement => getFieldset('devices')

const authenticationDetails = (): HTMLDetailsElement =>
  getDetails('authentication')

// DOMParser never executes scripts, which is exactly why it is the
// sanctioned way to load the real page into the simulated DOM; appended
// nodes are auto-adopted across documents.
const loadPage = (): void => {
  const parser = new DOMParser()
  const parsed = parser.parseFromString(pageHtml, 'text/html')
  document.head.replaceChildren(...parsed.head.children)
  document.body.replaceChildren(...parsed.body.children)
}

describe('settings page', () => {
  beforeEach(() => {
    sessionStorage.clear()
    loadPage()
    document.documentElement.lang = 'en'
  })

  describe('boot', () => {
    it('should build every section from the fixtures', async () => {
      const { ready } = await bootPage({
        storedCredentials: { username: 'stored@example.com' },
      })

      expect(ready).toHaveBeenCalledTimes(1)
      expect(document.documentElement.lang).toBe('fr')

      const username = getInput('username')

      expect(username.value).toBe('stored@example.com')
      expect(username.autocomplete).toBe('username')
      expect(username.autocapitalize).toBe('none')
      expect(username.placeholder).toBe('user@example.com')

      const password = getInput('password')

      expect(password.value).toBe('')
      expect(password.autocomplete).toBe('current-password')
      expect(settingSelect('always_on').value).toBe('true')
      expect(settingSelect('on_mode').value).toBe('')
      expect(settingSelect('temp_limit').value).toBe('15')
      expect(settingSelect('always_on').id).toBe('always_on__settings')
      expect(
        document.querySelector('select[data-setting-id="notes"]'),
      ).toBeNull()
      expect(devicesFieldset().hidden).toBe(false)
      expect(authenticationDetails().open).toBe(false)
      expect(applyButton().disabled).toBe(true)
    })

    it('should stay signed out when the session read says so', async () => {
      await bootPage({ routes: { ...defaultRoutes(), 'GET /sessions': false } })

      expect(devicesFieldset().hidden).toBe(true)
      expect(authenticationDetails().open).toBe(true)
    })

    it('should keep the authored language when the read fails', async () => {
      await bootPage({ failures: { 'GET /language': new Error('offline') } })

      expect(document.documentElement.lang).toBe('en')
    })

    it('should translate keys and skip empty or echoed translations', async () => {
      await bootPage({
        translations: {
          'settings.authenticate.legend': '',
          'settings.title': 'Réglages Heatzy',
        },
      })

      expect(shownText('.homey-title')).toBe('Réglages Heatzy')
      expect(shownText('[data-i18n="settings.authenticate.legend"]')).toBe(
        'Credentials',
      )
      expect(shownText('[data-i18n="settings.update"]')).toBe('Update')
    })

    it('should alert after the overlay when the build fails', async () => {
      const { alert, ready } = await bootPage({
        failures: { 'GET /settings/drivers': new Error('boom') },
      })

      expect(ready).toHaveBeenCalledTimes(1)
      expect(alert).toHaveBeenCalledWith('boom')
    })

    it('should swallow a failing alert channel', async () => {
      const { alert } = await bootPage({
        failures: { 'GET /settings/drivers': new Error('boom') },
        shouldRejectAlerts: true,
      })

      expect(alert).toHaveBeenCalledWith('boom')
    })

    it('should leave the fields empty when the stored read errors', async () => {
      await bootPage({ storedError: new Error('storage down') })

      expect(getInput('username').value).toBe('')
    })

    it('should leave the fields empty when nothing is stored', async () => {
      await bootPage({ storedCredentials: null })

      expect(getInput('username').value).toBe('')
    })
  })

  describe('device settings form', () => {
    it('should arm Apply on a divergence and disarm on revert', async () => {
      await bootPage()

      commit(settingSelect('always_on'), 'false')

      expect(applyButton().disabled).toBe(false)

      commit(settingSelect('always_on'), 'true')

      expect(applyButton().disabled).toBe(true)
    })

    it('should push the changed values and rebase the form', async () => {
      const { alert, api } = await bootPage({
        translations: { 'settings.success': 'Enregistré' },
      })

      commit(settingSelect('always_on'), 'false')
      commit(settingSelect('on_mode'), 'previous')
      applyButton().click()
      await settleDetached()

      expect(api).toHaveBeenCalledWith(
        'PUT',
        '/settings/devices',
        { always_on: false, on_mode: 'previous' },
        expect.any(Function),
      )
      expect(alert).toHaveBeenCalledWith('Enregistré')
      expect(applyButton().disabled).toBe(true)

      commit(settingSelect('always_on'), 'false')

      expect(applyButton().disabled).toBe(true)
    })

    it('should alert and keep the baseline when the push fails', async () => {
      const { alert } = await bootPage({
        failures: { 'PUT /settings/devices': new Error('offline') },
      })

      commit(settingSelect('always_on'), 'false')
      applyButton().click()
      await settleDetached()

      expect(alert).toHaveBeenCalledWith('offline')
      expect(applyButton().disabled).toBe(false)
    })

    it('should realign the form on Refresh', async () => {
      await bootPage()

      commit(settingSelect('always_on'), 'false')
      const refresh = getButton('refresh_settings_common')
      refresh.click()

      expect(settingSelect('always_on').value).toBe('true')
      expect(applyButton().disabled).toBe(true)
    })

    it('should refresh the grouped values on a device update', async () => {
      const { emit, routes } = await bootPage()

      routes['GET /settings/devices'] = {
        glow: { always_on: false, on_mode: 'cft' },
        heatzy: { always_on: false, on_mode: 'cft' },
      }
      emit('deviceupdate')
      await settleDetached()

      expect(settingSelect('always_on').value).toBe('false')
      expect(settingSelect('on_mode').value).toBe('cft')
    })

    it('should ignore a select it did not build', async () => {
      await bootPage()

      const rogue = document.createElement('select')
      const option = document.createElement('option')
      option.value = 'x'
      rogue.append(option)
      document.querySelector('#settings_common')?.append(rogue)
      commit(rogue, 'x')

      expect(applyButton().disabled).toBe(true)

      const refresh = getButton('refresh_settings_common')
      refresh.click()

      expect(rogue.value).toBe('x')
    })
  })

  describe('credentials', () => {
    it('should sign in with the trimmed credentials', async () => {
      const { api } = await bootPage({
        routes: { ...defaultRoutes(), 'GET /sessions': false },
      })

      commit(getInput('username'), ' user@example.com ')
      commit(getInput('password'), 'secret')

      expect(authenticateButton().disabled).toBe(false)

      authenticateButton().click()
      await settleDetached()

      expect(api).toHaveBeenCalledWith(
        'POST',
        '/sessions',
        { password: 'secret', username: 'user@example.com' },
        expect.any(Function),
      )
      expect(authenticationDetails().open).toBe(false)
      expect(devicesFieldset().hidden).toBe(false)
    })

    it('should alert instead of posting an emptied credential', async () => {
      const { alert, api } = await bootPage({
        routes: { ...defaultRoutes(), 'GET /sessions': false },
        translations: { 'settings.authenticate.failure': 'Échec' },
      })

      commit(getInput('username'), 'user@example.com')
      commit(getInput('password'), 'secret')
      // A programmatic clear fires no input event, so Sign in stays armed.
      getInput('username').value = ''
      authenticateButton().click()
      await settleDetached()

      expect(alert).toHaveBeenCalledWith('Échec')
      expect(api).not.toHaveBeenCalledWith(
        'POST',
        '/sessions',
        expect.anything(),
        expect.any(Function),
      )
    })

    it('should alert when the sign-in fails', async () => {
      const { alert } = await bootPage({
        failures: { 'POST /sessions': new Error('bad credentials') },
        routes: { ...defaultRoutes(), 'GET /sessions': false },
      })

      commit(getInput('username'), 'user@example.com')
      commit(getInput('password'), 'wrong')
      authenticateButton().click()
      await settleDetached()

      expect(alert).toHaveBeenCalledWith('bad credentials')
      expect(authenticationDetails().open).toBe(true)
    })

    // The route answers a stale device list on a sign-in the server
    // accepted but whose registry refresh failed. That is a warning
    // over a live session, never a credential failure: the page keeps
    // the account, folds the credentials away and opens the devices —
    // and still says what actually broke.
    it('should open the devices and warn when the list came back stale', async () => {
      const { alert } = await bootPage({
        routes: {
          ...defaultRoutes(),
          'GET /sessions': false,
          'POST /sessions': { isDeviceListStale: true },
        },
        translations: {
          'settings.authenticate.staleDevices': 'Liste non actualisée',
        },
      })

      commit(getInput('username'), 'user@example.com')
      commit(getInput('password'), 'secret')
      authenticateButton().click()
      await settleDetached()

      expect(devicesFieldset().hidden).toBe(false)
      expect(authenticationDetails().open).toBe(false)
      expect(alert).toHaveBeenCalledWith('Liste non actualisée')
    })

    it('should stay silent when the device list came back fresh', async () => {
      const { alert } = await bootPage({
        routes: { ...defaultRoutes(), 'GET /sessions': false },
      })

      commit(getInput('username'), 'user@example.com')
      commit(getInput('password'), 'secret')
      authenticateButton().click()
      await settleDetached()

      expect(devicesFieldset().hidden).toBe(false)
      expect(alert).not.toHaveBeenCalled()
    })

    it('should do nothing when the reset is not confirmed', async () => {
      const { api } = await bootPage({ isConfirmed: false })

      resetButton().click()
      await settleDetached()

      expect(api).not.toHaveBeenCalledWith(
        'DELETE',
        '/sessions',
        expect.any(Function),
      )
    })

    it('should sign out, clear the password and fold the devices', async () => {
      await bootPage({ storedCredentials: { password: 'secret' } })

      expect(getInput('password').value).toBe('secret')

      resetButton().click()
      await settleDetached()

      expect(getInput('password').value).toBe('')
      expect(devicesFieldset().hidden).toBe(true)
      expect(authenticationDetails().open).toBe(true)
    })

    it('should alert and keep the password when the sign-out fails', async () => {
      const { alert } = await bootPage({
        failures: { 'DELETE /sessions': new Error('offline') },
        storedCredentials: { password: 'secret' },
      })

      resetButton().click()
      await settleDetached()

      expect(alert).toHaveBeenCalledWith('offline')
      expect(getInput('password').value).toBe('secret')
    })

    it('should alert when the confirmation channel errors', async () => {
      const { alert } = await bootPage({
        confirmError: new Error('dialog down'),
      })

      resetButton().click()
      await settleDetached()

      expect(alert).toHaveBeenCalledWith('dialog down')
    })

    it('should keep sign-in greyed when the password field is missing', async () => {
      const settings = driverSettingsFixture()
      settings.login = settings.login?.filter(({ id }) => id === 'username')
      await bootPage({
        routes: { ...defaultRoutes(), 'GET /settings/drivers': settings },
      })

      expect(document.querySelector('#password')).toBeNull()

      commit(getInput('username'), 'user@example.com')

      expect(authenticateButton().disabled).toBe(true)

      resetButton().click()
      await settleDetached()

      expect(devicesFieldset().hidden).toBe(true)
    })

    it('should build no credential fields without a login group', async () => {
      const settings = driverSettingsFixture()
      delete settings.login
      delete settings.options
      const { alert } = await bootPage({
        routes: { ...defaultRoutes(), 'GET /settings/drivers': settings },
        translations: { 'settings.authenticate.failure': 'Échec' },
      })

      expect(document.querySelector('#username')).toBeNull()
      expect(document.querySelector('#password')).toBeNull()

      // The gate keeps the button greyed, but the listener itself must
      // still refuse a credential-less submit: dispatch past `disabled`.
      authenticateButton().dispatchEvent(new Event('click'))
      await settleDetached()

      expect(alert).toHaveBeenCalledWith('Échec')
    })
  })

  describe('freshness', () => {
    it('should refetch a stale page and skip the build', async () => {
      const stamped = document.createElement('link')
      stamped.setAttribute('href', 'index.css?v=aaaa1111')
      document.head.append(stamped)
      const { api, ready } = await bootPage({
        routes: {
          ...defaultRoutes(),
          'GET /webview-hashes': { settings: 'bbbb2222' },
        },
      })

      expect(ready).toHaveBeenCalledTimes(1)
      expect(api).toHaveBeenCalledWith(
        'POST',
        '/boot-error',
        expect.objectContaining({ name: 'WebviewFreshness' }),
        expect.any(Function),
      )
      expect(api).not.toHaveBeenCalledWith(
        'GET',
        '/settings/drivers',
        expect.any(Function),
      )
    })
  })
})
