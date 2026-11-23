# Heatzy for Homey

A [Homey](https://homey.app/) app for controlling [Heatzy](https://heatzy.com/) pilot-wire heating devices.

[![License](https://img.shields.io/github/license/OlivierZal/com.heatzy)](LICENSE)
[![GitHub release](https://img.shields.io/github/v/release/OlivierZal/com.heatzy?sort=semver)](https://github.com/OlivierZal/com.heatzy/releases)
[![CI](https://img.shields.io/github/actions/workflow/status/OlivierZal/com.heatzy/ci.yml?branch=main&label=CI)](https://github.com/OlivierZal/com.heatzy/actions/workflows/ci.yml)
[![Validate](https://img.shields.io/github/actions/workflow/status/OlivierZal/com.heatzy/validate.yml?branch=main&label=Validate)](https://github.com/OlivierZal/com.heatzy/actions/workflows/validate.yml)
[![CodeQL](https://github.com/OlivierZal/com.heatzy/actions/workflows/github-code-scanning/codeql/badge.svg)](https://github.com/OlivierZal/com.heatzy/actions/workflows/github-code-scanning/codeql)

[![Quality Gate](https://sonarcloud.io/api/project_badges/measure?project=OlivierZal_com.heatzy&metric=alert_status)](https://sonarcloud.io/dashboard?id=OlivierZal_com.heatzy)
[![Test coverage](https://sonarcloud.io/api/project_badges/measure?project=OlivierZal_com.heatzy&metric=coverage)](https://sonarcloud.io/component_measures?id=OlivierZal_com.heatzy&metric=coverage)

## Supported devices

The app adds one kind of device to Homey, "Heatzy". It covers the Heatzy Pilote of the 1st, 2nd, 3rd and 4th generation, the Heatzy Pilote Pro and the Heatzy Glow, Onyx and Shine, to control electric radiators, towel warmers and underfloor heating.

## Features

### Control and monitoring

What a device shows depends on the product. The names are the ones Homey shows, and each line adds to the ones above it:

- **Every product**: "Turned on" and "Thermostat mode" (Comfort, Eco, Frost protection, Off), with Comfort -1°C and Comfort -2°C as well on every product but the Pilote of the 1st, 2nd and 3rd generation. The Heatzy Pilote of the 1st generation shows nothing more.
- **Heatzy Pilote, 2nd to 4th generation**: "Locked" locks the controls on the device itself, and "Timer" turns the device's own heating program on or off. "Heater Operation Mode" is the derogation, a temporary override: Boost, Vacation or Off. "Derogation duration" counts minutes for Boost and days for Vacation, and "End of derogation" shows when it ends.
- **Heatzy Glow, Onyx and Shine**: "Temperature", "Target temperature" (the Comfort temperature, 15 to 30 °C) and "Target temperature - eco mode" (10 to 19 °C).
- **Heatzy Pilote Pro**: "Humidity", "Presence Alarm", "Open window detection", "Operational state" (the mode the device is applying right now) and one more derogation, Presence detection.

### Flow cards

Homey provides its own cards for the standard controls and readings, such as on/off, the thermostat mode, the lock and the temperatures. The app adds its own, each offered for the devices that have the matching control. When: "The derogation duration changed", "Timer turned on", "Timer turned off", "Open window detection turned on", "Open window detection turned off". And: "The derogation duration is/is not …", "The timer is turned on/off", "The open window detection is turned on/off". Then: "Set the derogation duration to …", "Set the timer to …", "Set the open window detection to …", "Set the eco mode temperature to …".

### App settings

The app's settings page lets you:

- sign in with your Heatzy username and password under "Credentials", and sign out with "Reset";
- change a device setting on all your Heatzy devices at once under "All device settings". A setting your devices disagree on is shown blank, and stays untouched unless you pick a value.

### Device settings

- "Disable shutdown from Homey": Homey can no longer switch the device off, whether with on/off or with the Off mode, and switching the setting on switches the device on. The device itself and its remote control can still switch it off.
- "Behavior when switching on": Comfort, Eco or Previous mode (the default), the mode a device takes when Homey turns it on. It applies to every Heatzy Pilote, Pro included, where turning a device off sets its mode to Off. Glow, Onyx and Shine have their own on/off switch and keep their mode.

### Energy and Insights

The app reports no energy use. In Insights, Homey logs on/off, the lock, the timer, the temperature, the two target temperatures, the humidity, the presence alarm and the open window detection, as far as the product has them.

## Requirements

- A Homey Pro with Homey v12.9.0 or later. The app does not run on Homey Cloud.
- A Heatzy account that already holds your devices: the app adds what the account lists.
- Internet access: the app reaches your devices through the Heatzy cloud, not over your local network.

## Getting started

1. Install the [Heatzy app](https://homey.app/a/com.heatzy) from the Homey App Store.
2. Add your devices via "Add device" → "Heatzy".
3. Sign in with your Heatzy username and password when asked, then select the devices to add.

You can also sign in beforehand, under "Credentials" in the app settings.

## Good to know

- "Presence Alarm" is on only while a Presence detection derogation is running and the device is applying Comfort.
- The app reads your devices from Heatzy every 5 seconds: that is how a change made on the device or in the Heatzy app reaches Homey.
- If your devices stop updating because Heatzy refuses your saved credentials, the app says so in Homey's timeline: sign in again from the app settings or by repairing a device. A passing Heatzy or network failure needs no action: the app retries by itself.

## Supported languages

English, French.

## Help and feedback

Ask questions and share feedback in the [Homey Community topic](https://community.homey.app/t/76406). Report a problem or request a feature on the [issues page](https://github.com/OlivierZal/com.heatzy/issues). To report a security vulnerability, follow [SECURITY.md](SECURITY.md).

## Contributing

To work on the app itself, see [CONTRIBUTING.md](CONTRIBUTING.md).

## Disclaimer

This app is not endorsed, verified or approved by Heatzy. Heatzy cannot be held liable for any claims or damages that may occur when using this app to control Heatzy devices.

## License

[GPL-3.0-only](LICENSE) © Olivier Zalmanski
