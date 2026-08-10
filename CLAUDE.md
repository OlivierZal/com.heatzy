# CLAUDE.md

Homey app for Heatzy (pilot-wire electric-heating cloud). ESM only,
Node >= 22.19. The API layer lives in `@olivierzal/heatzy-api` (GitHub
Packages, sibling repo with its own CLAUDE.md) — API bugs are fixed there,
not worked around here.

## Commands

Run the FULL suite before any push — CI runs all of it and each step has
caught real failures that the others miss:

- `npm run format` / `npm run format:fix` — prettier (eslint does NOT
  cover formatting).
- `npm run lint` / `npm run lint:fix` — ESLint (needs its 8 GB heap; also
  lints CSS and HTML via the css/html plugins).
- `npm run typecheck` — `tsc` from `@typescript/native` (TypeScript 7).
- `npm test` / `npm run test:coverage` — vitest; branches are at 100%,
  keep them there.
- `npm run build` — esbuild bundle (`scripts/bundle.mts`) + `tsc`
  emit, BOTH into `.homeybuild`. The Homey CLI runs `npm run build`
  when it detects TypeScript (`devDependencies.typescript`; it
  validates `outDir: .homeybuild`) — but only AFTER its pre-process
  copy into `.homeybuild`, so the source tree stays sources-only and
  everything the package needs must be emitted there: tsc does it via
  `outDir`, and `bundle.mts` emits the settings webview bundles there
  too (source-tree outfiles would land too late to be copied, and a
  store install would 404 the bundles). The CLI's own build invocation
  is therefore sufficient for install, run, validate and publish alike;
  a standalone suite run (no `.homeybuild` page copy) still proves the
  bundles compile.
- Cache-busting `?v=` — a PACKAGE-TIME transform: `bundle.mts` stamps
  every local asset reference of the `.homeybuild` page copy with a
  content hash (`?v=<hash>`), so phone webviews (which cache assets
  across app versions) refetch an asset exactly when its bytes change.
  The committed source HTML carries NO stamps — never hand-add a `?v=`
  there, and nothing needs re-committing when a webview source changes.
  Stamps exist only in the packaged app, and only within
  attribute/import reference contexts, never comments.
- `npm run homey:validate` — Homey validation at publish level; may
  rewrite files (see locales below), re-stage if it does.
- `npm run homey:start` — `homey app run --remote` for on-device testing.
  The `homey:*` wrappers are plain CLI calls: the CLI's own
  `npm run build` (post-copy) emits everything the package needs into
  `.homeybuild`, so no pre-build step is required anywhere.

Check real exit codes; never pipe a check's output through `tail`/`grep`
to judge success. Remove any `.claude/worktrees/**` leftovers before
running the suite — the vitest/eslint globs sweep them and corrupt
coverage.

## Homey platform gotchas

- `.homeycompose/` is the SOURCE for `app.json` and `locales/*.json`; the
  Homey CLI regenerates those outputs on every preprocess and writes them
  WITHOUT a trailing newline. Commit the CLI-generated form verbatim — do
  not "fix" the missing newline, and never edit generated files directly.
- `homey:validate` acts as a pre-push formatter hook of sorts: if it
  touches files, amend before pushing.
- The settings page (`settings/`) uses Homey's official `homey-form-*` /
  `homey-button-*` classes; the settings stylesheet only fills documented
  SDK gaps and app-specific design — Homey injects its own class-based
  stylesheet at runtime, which is not in the repo and not available
  offline.
- App-API surface conventions (aligned on com.melcloud): paths are
  kebab-case REST, `get*` for GET — except `is*` for a boolean GET —,
  `update*` for PUT (never `set*`), and a business verb for POST
  (`authenticate` on `/sessions`, `logWebviewBoot` on `/boot-error`),
  breadcrumbs log the verbed form (`'GET /settings/devices'`). Handler
  renames are wire-invisible (routing is method+path).
  `@olivierzal/homey-kit/settings` is the settings page's transport (the
  settings SDK is error-first-callback). The webview
  `fireAndForget` stays local by design: it binds
  `homey` to auto-alert, this page's error policy. The surface is
  test-pinned in two halves, one file each — extend BOTH when touching
  a route: `tests/unit/api-contract.test.ts` pins manifest ids ↔
  handlers both ways plus the handlers' function type;
  `tests/unit/api-route-guards.test.ts` pins the call sites (every
  webview path literal must match a declared route).
- Dirty-gating: `settings/dirty-gate.mts` is the ONE primitive behind the
  settings Apply/Refresh pair AND the credentials sign-in/reset pair
  (sign-in arms through `isActionable` only when both credential fields
  are filled; reset is its busy-gated Refresh) — never re-derive its
  invariant at a call site. The gate also freezes the gated
  fieldsets while a request is in flight (container `disabled` +
  `aria-busy`, so a control's own domain `disabled` survives the thaw):
  every success path rewrites the fields, so a mid-flight edit would be
  silently clobbered — pass every region the arming source reads through
  `fieldsetElements`. Arming comes from exactly ONE source, exclusive by
  type: baseline mode (`serialize`, a pure snapshot — never a
  request-body builder: reusing `buildSettingsBody` was the historical
  never-pristine bug, it filters null deltas) or predicate mode
  (`isActionable`, with no baseline to retain stale form state —
  `markSaved` then only re-evaluates); both of this app's pairs arm
  through predicates. Disabled greying styles
  `[class*='homey-button']:disabled` generically, never a per-class list
  (a class list silently missed renamed buttons).
  The kit's own suite locks the behavior — a change to the gate is a kit
  release, adopted here by an exact-pin bump.
- The injected sheet resets `fieldset.homey-form-checkbox-set` /
  `-radio-set` with `all: unset`, which leaves `display: inline` — and
  WebKit renders inline fieldsets atomically, so SIBLING sets tile side
  by side (a single set per section hides the bug for years). Restack
  them with a higher-specificity block rule. Any markup change that
  multiplies `homey-form-*` elements needs an on-device cold-open check:
  the injected sheet's resets make untested combinations render
  arbitrarily.
- Settings webview lifecycle: the bundle is a CLASSIC IIFE (esbuild
  `format: 'iife'` with a `globalName`), loaded via
  `<script defer src="index.js">` — NOT an ES module. A STATIC
  `<script type="module">` stalls the whole boot on a cold open (the SDK
  fires `onHomeyReady` only after `load`, so a stalled module fetch
  blocks even that), while classic scripts — like the stylesheets — load
  cold. The HTML declares the docs' canonical global
  `function onHomeyReady(homey)` inline (it must exist at parse time),
  which polls the bundle's global and calls its `start(homey)` once the
  bundle is up; the poll's timeout ends the overlay if the bundle never
  loads, and the init path calls `Homey.ready()` in a `finally` so a
  hanging data fetch cannot spin forever. Do not churn the loading
  mechanism without new on-device evidence: classic `defer` is the
  cold-verified form.
- Phone webviews also cache the HTML ITSELF across app versions, so
  shipped bundle filenames are a COMPAT CONTRACT: `scripts/bundle.mts`
  builds the settings entry twice — `index.js` (IIFE) for the current
  HTML, plus an `index.mjs` twin for every cached older HTML. A second cache layer covers the HTML
  itself (phone webviews cache the page across app versions,
  force-close included): each bundle carries a freshness handshake —
  the page's identity is the document-order join of its `?v=` stamps (a CSS-only ship moves it too), `GET /webview-hashes` serves the
  live hashes (a manifest `bundle.mts` emits into the packaged app,
  read by `@olivierzal/homey-kit/node`; `api.mts` passes the manifest
  URL explicitly — the kit's default resolves against its own module,
  which lives in `node_modules`), and a mismatch triggers ONE
  refetch of the document through a never-cached address
  (`?fresh=<identity>` — a bare reload can be re-served the same stale
  document from the HTTP cache; sessionStorage guard,
  `watchWebviewFreshness` from `@olivierzal/homey-kit/webview`), whose
  fresh stamps pull the fresh assets;
  a mismatch that survives its refetch is reported to
  `POST /boot-error`. The guarantee lives in the BOOT check, and which
  surface needs it was measured on device (2026-08-07): the web-app
  settings page is destroyed and REMOUNTED when the app restarts, and
  mobile widgets reload too — both are fresh for free. Only the mobile
  settings page survives an app restart, so it alone never boots again;
  that is why the watcher re-checks on RETURN TO THE FOREGROUND
  (`visibilitychange`), the trigger that covers it. The app also emits a
  `webview_hashes_changed` realtime event at its own boot and the page
  subscribes to it, but it guarantees NOTHING on its own: it fires at
  the end of the app's `onInit`, i.e. exactly when the restart has just
  disconnected every open page, so its audience is absent by
  construction (measured: an open mobile page produced no request and no
  breadcrumb). Never fold the visibility trigger into it. Every failure
  path stays open: an unstamped page, an absent route or denied
  storage must never take a working webview down. Heatzy
  divergence from com.melcloud: the cached-HTML era here loaded
  `index.mjs` as a CLASSIC `defer` script (never `type="module"`), so
  the shipped `index.mjs` twin is a SECOND IIFE with a
  `globalThis.onHomeyReady` footer — NOT plain ESM (a classic script
  would choke on `export`, and those cached pages declare no inline
  `onHomeyReady`, so the footer provides it). Never rename or drop a
  shipped bundle filename; add alongside.

## Driver conventions

- One driver, `drivers/heatzy/`, covers every product generation; there
  are no per-generation driver classes. Capability policy is
  product-gated at pairing (`list_devices`) and again at device init,
  through `HeatzyDriver.getRequiredCapabilities` (V1 exposes the mode
  only, V2/V4 add derogations, timer and lock, Glow adds temperatures,
  Pro adds its measures and detections) and
  `HeatzyDriver.getCapabilitiesOptions` (runtime enum values only — the
  mode vocabularies differ: comfort −1/−2 exist from V4 up, presence is
  Pro-only). Runtime capability options must be complete option objects,
  and only for capabilities the device actually gets.
- Wire converters are product-aware: Glow speaks `on_off`/`LOCK_C`
  where every other generation speaks `mode`/`lock_switch`. That
  dialect split lives in the converters next to the device class; wire
  normalization beyond it belongs in `@olivierzal/heatzy-api`, not
  here.
- Flow-card registration is capability-generic: the driver walks its
  manifest capabilities and registers condition/action run listeners
  mechanically; the settable surface is the driver's `setCapabilities`
  list.

## Naming & authored-content conventions

- What `@typescript-eslint/naming-convention` cannot see is convention
  too: booleans read as questions even untyped (`isX`/`hasX`), handlers
  as verbs; a name states what the thing IS, never its history. Test
  files are named after the unit under test (`<module>.test.ts`); shared
  test helpers keep their family's names — apps say `assertDefined` and
  `mock(overrides)` where the libraries say `defined` and
  `mock(value?)`: two test families, deliberately not unified.
- Static markup and styles live in `.html`/`.css` files. TS builds DOM
  only when the content is programmatic (computed values, per-item
  nodes), via `createElement` — never `innerHTML` (`no-unsafe-dom-html`
  enforces it). Inline style writes are reserved for values CSS cannot
  express; anything static belongs in the stylesheet, following the
  CSS/HTML lint rules' spirit even where no rule captures it.
- The webview runtime floor (es2023: no `Object.groupBy`, no iterator
  helpers, no `v` regex flag) is enforced by a scoped lint block over
  `settings/` — the tsconfig cannot express two runtimes in one
  project. A `tsconfig.webview.json` floor was probed and refused on
  com.melcloud (2026-08-06): tsc checks the import CLOSURE, which
  crosses into node-side code — the same shape exists here
  (`settings/` imports shared `lib/` and `types/` modules).
- TWO floors coexist, on UNRELATED engines — never let one move the
  other. The **webview** floor is es2023 and is set by the phone's
  WebKit, which no Homey firmware can rejuvenate: it stays enforced by
  the scoped lint block above, and the danger there is APIs, because
  esbuild lowers syntax but NEVER polyfills (`Object.groupBy`, iterator
  helpers…; the regex `v` flag is the mixed case — syntax esbuild does
  not lower, hence its place in the same block). The **node-side**
  floor is the Homey's own Node, and it is held by the manifest's
  `compatibility` declaration, not by a check.
- A floor is declared from WHERE THE CODE RUNS, never from what a
  dependency happens to require. `compatibility: ">=12.9.0"` is
  Athom's own documented Node 22 boundary ("as of Homey v12.9.0, all
  Homey platforms run apps on Node.js v22") and already covers the
  `engines` of every shipped dependency. Raising it cannot express
  more than it already does: the two firmware lines are numbered
  independently, so one semver range cannot say "has Node 22" across
  both — and on Homey Pro (2016-2019) the Node 22 firmware is still
  only a release candidate, so a raise would cut off that whole stable
  install base rather than a few laggards.
- Node-side runtime APIs above es2022 are therefore LEGITIMATE:
  `toSorted`/`toReversed` (Node 20), `Object.groupBy` (Node 21) and
  `Promise.withResolvers` (Node 22) all predate the declared engine,
  and `@olivierzal/homey-kit` already calls `toSorted` inside the boot
  path. Never rewrite one away for an engine the manifest does not
  claim — `unicorn/no-array-sort` mandates `toSorted` anyway. The same
  holds for syntax: `files.mts` reads its JSON through import
  attributes, the statically analysable form.

## Tooling boundary (@olivierzal/configs)

The shared tooling lives in `@olivierzal/configs` (exact pin): the
eslint `homeyApp` preset (plugins are the package's dependencies — no
plugin devDeps here), the prettier config (`"prettier"` key in
package.json, no local file), the `tsconfig/app` base and the vitest
`swcPlugin`. The overlay keeps ONLY per-repo verdicts: the lint ignores
(`.homeybuild/`, `coverage/`), the preset's per-app globs (bundled
sources, default-export files, jsdoc files, untyped test doubles, the
webview floor), and tsconfig `outDir`. Do not re-declare family policy
locally — a rule evaluation or version bump happens in configs,
adoption is a reviewed pin bump. Never extend `tsconfig/app-build`: its
`rootDir` resolves against the base file inside node_modules (the trap
the configs README documents) — `tsconfig.build.json` extends the LOCAL
`./tsconfig.json` and keeps `rootDir`/`exclude` here. The
CI/audit/claude*/dependabot/pr-title/zizmor workflows are stubs calling
the family reusables in OlivierZal/configs, pinned `@<sha> # vX.Y.Z`;
`publish.yml`, `validate.yml` and `claude-dependabot-fix.yml` stay
local (no reusable exists for the first two; the fix reusable grants no
`packages: read` and cannot carry the repo's heatzy-api doctrine line),
so the composite action stays too — installs pass `npm-token` (the
configs and heatzy-api dependencies live on GitHub Packages, where even
reads need auth).

## Runtime boundary (@olivierzal/homey-kit)

`@olivierzal/homey-kit` (exact pin, a PRODUCTION dependency — the
manifest reader runs on the device) owns what used to be copied across
the three apps: the dirty gate and the freshness handshake
(`/webview`), the settings transport (`/settings`), the manifest reader
(`/node`), `fireAndForget`/`getErrorMessage`/`NotFoundError`/`sequential`
(root) and the
two test kernels (`/testing`). A change to any of them is a kit release
adopted here by a pin bump — never a local edit, never a re-derivation.

What stays local, by measurement rather than omission:

- The webview `fireAndForget` in `settings/index.mts`: it binds `homey`
  to auto-alert, this page's error policy. The kit's node-side seam
  takes `(promise, logger, message)` and is what `app.mts` and
  `drivers/heatzy/device.mts` use — the app or device instance passes
  itself, no error adapter at any site.
- `lib/homey.mts`. (`NotFoundError` moved to the kit: the class only
  names the error, the localized message is passed at the throw site.)
- `homey-override.d.ts` keeps its `declare module` block: module
  augmentation cannot be packaged. It EXTENDS the SDK interfaces and
  takes only the narrowed member signatures from the kit generics
  (`TypedManagerDrivers['getDrivers']`, `TypedManagerSettings['get' |
'set']`). Extending the SDK interface and the generic side by side
  does not work — they both declare those members, and the conflict
  silently resolves to the SDK's wider type.

`api.mts` passes the manifest URL to `getWebviewHashes`: only the caller
knows where the bundler stamped it. The kit made that argument REQUIRED
in 2.0.0 — its former default resolved against the kit's own module in
`node_modules`, a path that never exists, and the reader fails open with
an empty map, so the omission silently disabled the whole handshake.

## Lint doctrine

- Code adapts to the rules, never the reverse. Never add a disable — not
  inline, not through config options or ignore regexes: refactor until
  the rule passes (rename the binding, move the polymorphic default to a
  nullable field, push the logic to a class that uses `this`, route casts
  through the shared typed helpers…). The existing disables are debt:
  remove them when touching the code they guard, never replicate them.
  One counterweight: when every compliant shape reads worse than the
  violation (a rule's own documented exception like a sequential-by-design
  loop, a protocol-imposed form, a rule-pair conflict), the documented
  disable IS the honest form — simplicity outranks disable-count golf.
- A config-level `'off'` with a one-line reason is not a disable: it
  is the triage ledger for opt-in rules that were evaluated and
  refused (tool-ownership overlap, platform floor, absent domain).
  Disables suppress an adopted rule; ledger entries record a verdict —
  re-evaluate one when its stated reason expires (target bump, new
  tooling).
- Zero-warning policy: every enabled rule is at `error`.
- Metric caps (`complexity`, `max-statements` 10, `max-depth`,
  `unicorn/try-complexity` 1…) are measured codebase ceilings: exceeding
  one means extract/refactor, not bump.
- Class members sort alphabetically (perfectionist), fields before
  methods, public before private. Increments use prefix `++`/`--`.
- All-type exports hoist the keyword (`export type { A, B }`); mixed
  exports keep inline `type` specifiers, mirroring the
  inline-type-imports style. No shipped rule enforces the export side
  (`consistent-type-exports` tolerates inline specifiers once present;
  `import-x/consistent-type-specifier-style` covers imports only): the
  convention is maintained by hand, in review — a bespoke
  `no-restricted-syntax` selector for it was removed by decision
  (2026-07-28).
- Comments state intent or a constraint the code cannot show — never
  history ("was X before"), narration, or the library something came from.
- Beware `no-unnecessary-condition` vs TypeScript's control-flow
  narrowing across `await`: a re-check of externally-mutated state (e.g.
  `signal.aborted`) reads as "always false" — route through an API that
  reads the live value instead (`signal.throwIfAborted()`).

## Repo process

- Companion docs are part of a change's definition of done: whenever a
  PR changes behavior, API surface, requirements or process, the same
  PR updates the affected companion files (README.md, CONTRIBUTING.md,
  SECURITY.md, CLAUDE.md) — never a later sweep; the 2026-08 README
  audit caught exactly the drift this prevents (a shipped Home ATW
  driver absent from its README, a stale `Result` kind list).
- A settling pass closes every substantive wave: before its work is
  released, re-read the wave's own diff for what the churn left behind
  — history-narrating comments, orphaned helpers or config entries,
  factorizations the fix made obvious — and fold the findings into a
  targeted follow-up. Features land first, the pass runs after, so it
  covers them; it is scoped to the wave's diff, never a full re-review.

- `@olivierzal/heatzy-api` is pinned EXACTLY, never with a caret: the
  library's breaking changes are self-published, adoption is an explicit
  reviewed PR per release, and a caret is precisely what held the
  published 11.0.0 auth fix away from users for six days (2026-08). The
  library's own Releasing doctrine mirrors this — publishing is not done
  until the adoption PR lands here.
- `main` is protected (PRs only, squash merges); no merge queue
  (user-owned repo, org-only feature).
- The PR title IS the commit that lands: `squash_merge_commit_title` is
  `PR_TITLE`, so the title is the single source (under the former
  `COMMIT_OR_PR_TITLE`, a one-commit PR silently took its commit subject
  instead). It must follow Conventional Commits, which the required
  `PR title` check enforces (`.github/workflows/pr-title.yml`,
  byte-identical in the five repos) — default type set, no scope
  allowlist, and no `subjectPattern`: subjects legitimately open on a
  proper noun. Dependabot's prefixes are pinned to `build(deps)` /
  `build(deps-dev)` rather than inferred, which is what had it land a
  different style in each repo.
- After every push, monitor the triggered pipelines to completion — the
  PR checks after a push, the publish run after a release tag — and act
  on the outcome: rerun transient infra failures (a SonarCloud 504 is
  not a finding), fix real ones. Work is not done while its pipeline is
  red or unwatched.
- Copilot reviews every PR, and every review thread (Copilot or human)
  must end RESOLVED: with a code change when the point holds, or with a
  reasoned reply when it does not — verify claims against sources
  before acting either way (Copilot has been wrong about library
  semantics). Resolve the thread once settled; none left dangling.
- SonarCloud must be spotless for a PR to merge — and the quality gate
  passing is necessary, NOT sufficient: the free-tier gate tolerates
  3 % duplication on new code, lets code smells through, and cannot be
  customized, so the real bar is ours, held in review. That bar is
  zero on BOTH windows — new code and overall alike: zero open issues
  of every kind (bugs, code smells, vulnerabilities) across the whole
  project, 0 % duplicated lines across the whole codebase, and 100 %
  coverage (within the exclusions `sonar-project.properties`
  declares). A Sonar finding is handled like a lint error — the code
  adapts, or the divergence is settled as a documented verdict (e.g.
  the `Number.NaN` convention in `eslint.config.ts`) — never merged
  over.
- The SonarCloud project runs **CI-based analysis** (the `ci.yml` scan
  step on the Node 22 leg): **Automatic Analysis must stay DISABLED** in
  the project's Administration settings, or the CI scanner aborts with
  `exit 3` and fails the required `Test (Node 22)` leg. Coverage
  exclusions cover `settings/**` and `scripts/**` (the webview bundle is
  browser code exercised on-device, not in vitest).
- Verify claimed library behavior empirically (headless chromium against
  the real dist/bundle in the scratchpad) rather than from memory.
- Homey App Store releases: write the user-facing changelog entry into
  `.homeychangelog.json` under the NEW version key (`en` + `fr` — this
  app ships 2 locales only, not 13; non-exhaustive store-facing
  wording), bump `version` in `.homeycompose/app.json`, align
  `package.json` via `npm version X.Y.Z --no-git-tag-version`, run
  `homey:validate` to regenerate `app.json`, and land it all through a
  PR. Then tag `vX.Y.Z` and publish a GitHub release: `publish.yml`
  fires on release-published (environment `homey`, `HOMEY_PAT` secret)
  and pushes to the App Store via athombv's action. The old
  `update-version.yml` workflow is deleted debt — it committed directly
  to `main` and fails against the ruleset; never restore or dispatch
  it, the PR + release flow above replaces it.
- Store submissions: a rejected version number cannot be resubmitted —
  bump the patch version.
