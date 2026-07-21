# Heatzy for Homey

A [Homey](https://homey.app/) app for controlling [Heatzy](https://heatzy.com/) pilot-wire heating devices.

[![License](https://img.shields.io/github/license/OlivierZal/com.heatzy)](LICENSE)
[![GitHub release](https://img.shields.io/github/v/release/OlivierZal/com.heatzy?sort=semver)](https://github.com/OlivierZal/com.heatzy/releases)
[![CI](https://img.shields.io/github/actions/workflow/status/OlivierZal/com.heatzy/ci.yml?branch=main&label=CI)](https://github.com/OlivierZal/com.heatzy/actions/workflows/ci.yml)
[![Validate](https://img.shields.io/github/actions/workflow/status/OlivierZal/com.heatzy/validate.yml?branch=main&label=Validate)](https://github.com/OlivierZal/com.heatzy/actions/workflows/validate.yml)
[![CodeQL](https://github.com/OlivierZal/com.heatzy/actions/workflows/github-code-scanning/codeql/badge.svg)](https://github.com/OlivierZal/com.heatzy/actions/workflows/github-code-scanning/codeql)

[![Quality Gate](https://sonarcloud.io/api/project_badges/measure?project=OlivierZal_com.heatzy&metric=alert_status)](https://sonarcloud.io/dashboard?id=OlivierZal_com.heatzy)
[![Test coverage](https://sonarcloud.io/api/project_badges/measure?project=OlivierZal_com.heatzy&metric=coverage)](https://sonarcloud.io/component_measures?id=OlivierZal_com.heatzy&metric=coverage)

## Introduction

This app integrates [Heatzy](https://heatzy.com/) into [Homey](https://homey.app/) to pilot electric radiators, towel warmers and underfloor heating:

- **Heatzy Pilote** (1st, 2nd and 4th generations) — pilot-wire modes, derogations (boost, vacation), timer, lock
- **Heatzy Glow, Onyx and Shine** — everything above, plus temperature measures and comfort/eco setpoints
- **Heatzy Pro** — everything above, plus presence detection, humidity and window-detection

## Installation

1. Install the [Heatzy app](https://homey.app/a/com.heatzy) from the Homey App Store.
2. Open the app settings and log in with your Heatzy credentials.
3. Add your devices via the pairing wizard.

## Supported languages

English, French.

## Development

Requirements: Node.js 22 and the [Homey CLI](https://apps.developer.homey.app/the-basics/getting-started) (`npx homey`).

```bash title="Common commands"
npm ci               # install dependencies
npm test             # run the test suite (vitest)
npm run typecheck    # type-check with the native TypeScript compiler
npm run lint         # eslint (TS, HTML, CSS, JSON, YAML, Markdown)
npm run build        # bundle browser entries (esbuild) + native tsc compile
npm run homey:start  # run the app on your Homey (remote)
```

Architecture notes:

- The API layer lives in [@olivierzal/heatzy-api](https://github.com/OlivierZal/heatzy-api), a sibling repository with its own tooling; API bugs are fixed there, not worked around here.
- Browser code (the `settings/` page) is bundled by `scripts/bundle.mjs` into self-contained bundles; the outputs are emitted into `.homeybuild` by `npm run build`, which the Homey CLI runs automatically on validate/publish.
- Both the build and `npm run typecheck` use the native TypeScript 7 compiler (`typescript@7` aliased as `@typescript/native`) for speed; `typescript@6` remains alongside it for tools that need the JS API (typescript-eslint) until TypeScript 7.1 ships its stable programmatic API.
- Test coverage is enforced at 100% for backend code; browser glue (`settings/`) is excluded from coverage, so the badge covers the driver, app and API layers only.

## Disclaimer

This app is not endorsed, verified or approved by Heatzy. Heatzy cannot be held liable for any claims or damages that may occur when using this app to control Heatzy devices.

## License

GPL-3.0-only
