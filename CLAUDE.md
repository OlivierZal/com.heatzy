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
  `settings/callback-api.mts` is the settings page's transport (the
  settings SDK is error-first-callback); it is a byte-identical copy of
  com.melcloud's (com.melcloud.extension carries the third) — edit all
  three together. `fireAndForget` stays local by design: it binds
  `homey` to auto-alert, this page's error policy. The surface is
  test-pinned in two halves, one file each — extend BOTH when touching
  a route: `tests/unit/api-contract.test.ts` pins manifest ids ↔
  handlers both ways plus the handlers' function type;
  `tests/unit/api-route-guards.test.ts` pins the call sites (every
  webview path literal must match a declared route).
- Dirty-gating: `settings/dirty-gate.mts` is the ONE primitive behind the
  settings Apply/Refresh pair — never re-derive its invariant at a call
  site. Its `serialize` must stay a PURE form snapshot, never a
  request-body builder (reusing `buildSettingsBody` was the historical
  never-pristine bug: it filters null deltas), and disabled greying styles
  `[class*='homey-button']:disabled` generically, never a per-class list
  (a class list silently missed renamed buttons).
  `tests/unit/dirty-gate.test.ts` locks the behavior; the module is a
  byte-identical copy of com.melcloud's `public/dirty-gate.mts`
  (com.melcloud.extension carries the third copy) — edit all three
  together.
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
  HTML, plus an `index.mjs` twin for every cached older HTML. Heatzy
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
- The webview runtime floor (es2023, no `Object.groupBy`, no iterator
  helpers) is enforced by a scoped lint block over `settings/` — the
  tsconfig cannot express two runtimes in one project. Node-side code
  may use the newer APIs freely.

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
- SonarCloud must be spotless for a PR to merge: quality gate green,
  zero open issues on its analysis, and 100 % coverage (within the
  exclusions `sonar-project.properties` declares). A Sonar finding is
  handled like a lint error — the code adapts, or the divergence is
  settled as a documented verdict (e.g. the `Number.NaN` convention in
  `eslint.config.ts`) — never merged over.
- The SonarCloud project runs **CI-based analysis** (the `ci.yml` scan
  step on the `lts/*` leg): **Automatic Analysis must stay DISABLED** in
  the project's Administration settings, or the CI scanner aborts with
  `exit 3` and fails the required `Test (Node lts/*)` leg. Coverage
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
