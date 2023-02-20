import type Homey from 'homey/lib/Homey'
import { type LoginCredentials, type Settings } from '../types'

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function onHomeyReady(Homey: Homey): Promise<void> {
  await Homey.ready()

  const applySettingsElement: HTMLButtonElement = document.getElementById(
    'apply-settings'
  ) as HTMLButtonElement
  const authenticateElement: HTMLButtonElement = document.getElementById(
    'authenticate'
  ) as HTMLButtonElement

  const isAuthenticatedElement: HTMLDivElement = document.getElementById(
    'is-authenticated'
  ) as HTMLDivElement
  const isNotAuthenticatedElement: HTMLDivElement = document.getElementById(
    'is-not-authenticated'
  ) as HTMLDivElement

  const usernameElement: HTMLInputElement = document.getElementById(
    'username'
  ) as HTMLInputElement
  const passwordElement: HTMLInputElement = document.getElementById(
    'password'
  ) as HTMLInputElement
  const intervalElement: HTMLInputElement = document.getElementById(
    'interval'
  ) as HTMLInputElement

  const alwaysOnElement: HTMLSelectElement = document.getElementById(
    'always_on'
  ) as HTMLSelectElement
  const onModeElement: HTMLSelectElement = document.getElementById(
    'on_mode'
  ) as HTMLSelectElement

  function getHomeySetting(
    element: HTMLInputElement | HTMLSelectElement,
    defaultValue: any = ''
  ): void {
    // @ts-expect-error bug
    Homey.get(element.id, async (error: Error, value: any): Promise<void> => {
      if (error !== null) {
        // @ts-expect-error bug
        await Homey.alert(error.message)
        return
      }
      element.value = String(value ?? defaultValue)
    })
  }

  function hasAuthenticated(isAuthenticated: boolean = true): void {
    isAuthenticatedElement.style.display = isAuthenticated ? 'block' : 'none'
    isNotAuthenticatedElement.style.display = !isAuthenticated
      ? 'block'
      : 'none'
  }

  function int(
    element: HTMLInputElement,
    value: number = Number.parseInt(element.value)
  ): number {
    if (
      Number.isNaN(value) ||
      value < Number(element.min) ||
      value > Number(element.max)
    ) {
      element.value = ''
      throw new Error(
        Homey.__('settings.int_error.message', {
          name: Homey.__(`settings.int_error.values.${element.id}`),
          min: element.min,
          max: element.max
        })
      )
    }
    return value
  }

  function buildSettingsBody(
    settings: Array<HTMLInputElement | HTMLSelectElement>
  ): Settings {
    const body: Settings = {}
    for (const setting of settings) {
      if (setting.value !== '') {
        const settingValue: number = Number.parseInt(setting.value)
        if (!Number.isNaN(settingValue)) {
          body[setting.id] =
            setting instanceof HTMLInputElement
              ? int(setting, settingValue)
              : settingValue
        } else if (['true', 'false'].includes(setting.value)) {
          body[setting.id] = setting.value === 'true'
        } else {
          body[setting.id] = setting.value
        }
      }
    }
    return body
  }

  function load(): void {
    hasAuthenticated()
  }

  intervalElement.min = '1'
  intervalElement.max = '60'

  getHomeySetting(usernameElement)
  getHomeySetting(passwordElement)
  load()

  authenticateElement.addEventListener('click', (): void => {
    const body: LoginCredentials = {
      username: usernameElement.value,
      password: passwordElement.value
    }
    // @ts-expect-error bug
    Homey.api(
      'POST',
      '/login',
      body,
      async (error: Error, login: boolean): Promise<void> => {
        if (error !== null) {
          // @ts-expect-error bug
          await Homey.alert(error.message)
          return
        }
        if (!login) {
          // @ts-expect-error bug
          await Homey.alert(
            Homey.__('settings.alert.failure', {
              action: Homey.__('settings.alert.actions.authenticate')
            })
          )
          return
        }
        // @ts-expect-error bug
        await Homey.alert(
          Homey.__('settings.alert.success', {
            action: Homey.__('settings.alert.actions.authenticate')
          })
        )
        load()
      }
    )
  })

  applySettingsElement.addEventListener('click', (): void => {
    let body: Settings = {}
    try {
      body = buildSettingsBody([
        intervalElement,
        alwaysOnElement,
        onModeElement
      ])
    } catch (error: unknown) {
      // @ts-expect-error bug
      Homey.alert(error.message)
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
        if (!ok) {
          // @ts-expect-error bug
          await Homey.alert(
            Homey.__('settings.alert.failure', {
              action: Homey.__('settings.alert.actions.apply')
            })
          )
          return
        }
        // @ts-expect-error bug
        Homey.api(
          'POST',
          '/settings',
          body,
          async (error: Error, success: boolean): Promise<void> => {
            if (error !== null) {
              // @ts-expect-error bug
              await Homey.alert(error.message)
              return
            }
            if (!success) {
              // @ts-expect-error bug
              await Homey.alert(
                Homey.__('settings.alert.failure', {
                  action: Homey.__('settings.alert.actions.apply')
                })
              )
              return
            }
            // @ts-expect-error bug
            await Homey.alert(
              Homey.__('settings.alert.success', {
                action: Homey.__('settings.alert.actions.apply')
              })
            )
          }
        )
      }
    )
  })
}
