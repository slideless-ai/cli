# Slideless CLI

The `slideless` npm CLI. Wraps the Slideless HTTP API so users (and skills) can share, update, list, and inspect presentations from the terminal without hand-rolling fetch + auth + error handling each time.

## Project structure

```
src/
  cli/
    index.ts                # Commander root, registers commands, preAction hook
    commands/
      login.ts              # save API key (alias of `config set`)
      logout.ts
      whoami.ts             # POST /verifyApiKey + show identity
      use.ts                # switch / list profiles
      verify.ts             # explicit key verification
      auth/
        index.ts            # parent for OTP-based signup/login
        signup-request.ts   # POST /cliRequestSignupOtp
        signup-complete.ts  # POST /cliCompleteSignup + save profile
        login-request.ts    # POST /cliRequestLoginOtp
        login-complete.ts   # POST /cliCompleteLogin + save profile
      config/
        index.ts            # parent
        set.ts              # save profile (interactive or --api-key)
        show.ts             # list all profiles
        clear.ts            # remove profile(s)
      share.ts              # POST /uploadSharedPresentation OR /updateSharedPresentation (--update)
      update.ts             # explicit update form: POST /updateSharedPresentation
      list.ts               # GET /listMyPresentations
      get.ts                # GET /getSharedPresentationInfo/<id>
    utils/
      output.ts             # ANSI colors, --json formatter, exitWithError
      prompts.ts            # masked input for API key
  utils/
    config.ts               # multi-profile config at ~/.config/slideless/config.json
    api-client.ts           # fetch wrapper, Authorization: Bearer, error decoding (propagates nextAction/details)
    auth-client.ts          # verifyApiKey
    auth-flow-client.ts     # cliRequestSignupOtp / cliCompleteSignup / cliRequestLoginOtp / cliCompleteLogin
    logo-reader.ts          # read + validate + base64-encode a logo file for signup-complete
    presentations-client.ts # share/update/list/get HTTP calls
  types/
    api.ts                  # mirrors functions/src/features/shared-presentations/types
tests/
  cli/                      # CLI integration tests
  utils/                    # config resolution, error decoding tests
```

## Stack

- TypeScript, Node 20+, ESM
- `commander` 12.x for command parsing
- Native `fetch` (no SDK)
- `vitest` for tests
- Published as `slideless` on npm; binary `slideless`

## Conventions

### Auth

- HTTP header: **`Authorization: Bearer <key>`** (standard practice — same as Stripe/OpenAI/Anthropic). The Slideless backend was migrated away from the legacy `X-Process-Manager-Key` header at the same time as this CLI shipped.
- API keys: `cko_` (organization) or `cka_` (admin) prefix.
- Key resolution: `--api-key` flag → `SLIDELESS_API_KEY` env → active profile → error.
- Base URL resolution: `--api-url` flag → `SLIDELESS_API_BASE_URL` env → profile baseUrl → production default (`https://europe-west1-slideless-ai.cloudfunctions.net`).

### Output

- Default: human-readable, ANSI-colored, structured (`✓` green, `✗` red).
- `--json`: stable shape `{ success: true, data: {...} }` or `{ success: false, error: { code, message } }` for skill/CI consumption.

### Endpoints

Endpoint paths live in `src/utils/config.ts` as a single `ENDPOINTS` constant (mirroring the codika-cli pattern (GH repo still: codika-io/codika-helper-sdk)). Update there when backend paths change.

### Adding a new command

1. Create `src/cli/commands/<name>.ts` exporting a `Command`.
2. Register it in `src/cli/index.ts` via `program.addCommand(...)`.
3. If it talks to the backend, put the HTTP call in the appropriate `src/utils/*-client.ts` and call from the command.
4. Always support `--json`. Always set non-zero exit on error.

### Error handling

- Commands wrap their action in try/catch.
- `exitWithError(message, code)` from `cli/utils/output.ts` for fatal errors.
- HTTP clients return `{ success, data, error }` discriminated unions — never throw across the boundary.

## Local development

```bash
npm install
npm run build
npm link            # makes `slideless` available on PATH

slideless login     # interactive, against production
slideless whoami
slideless share ./test.html --title "test"
```

To target a non-production backend (e.g. a local emulator):

```bash
SLIDELESS_API_BASE_URL=http://localhost:5001/slideless-ai/europe-west1 slideless ...
```

## Tests

```bash
npm test
```

Vitest covers config resolution, JSON output shape, and HTTP error decoding. CLI integration tests stub `fetch` and assert command behaviour.

## Releases (automated via GitHub Actions)

Publishing to npm is fully automated. **Never run `npm publish` manually** — tag the version and let CI do it.

### Flow

```bash
# 1. Make sure main is clean and green locally
npm test && npm run build

# 2. Bump the version (picks up the commit + creates the git tag in one shot)
npm version patch    # 0.2.0 → 0.2.1   (bug fix)
npm version minor    # 0.2.0 → 0.3.0   (new feature, backward-compatible)
npm version major    # 0.2.0 → 1.0.0   (breaking)

# 3. Push the commit and the tag — the tag is what triggers the publish
git push origin main --follow-tags
```

### What each workflow does

- **`.github/workflows/ci.yml`** — runs on every push to `main` and every PR. Installs deps, runs `npm test`, runs `npm run build`, executes the built CLI binary with `--help` as a smoke test. Matrix'd across Node 20 and 22.
- **`.github/workflows/publish.yml`** — runs on tag pushes matching `v*.*.*`. Before publishing it (a) verifies the tag matches `package.json#version`, (b) re-runs tests, (c) re-runs the build, then publishes with `--access public --provenance` so the package carries a signed attestation from GitHub Actions.

### Prerequisites

- `NPM_TOKEN` secret configured on `slideless-ai/cli` — must be an **automation token** (classic type), NOT a granular access token, so it bypasses npm's 2FA OTP prompt at publish time.
- Regenerate it via https://www.npmjs.com/settings/~/tokens/new → "Classic Token" → "Automation".

### Troubleshooting

| Symptom | Likely cause |
|---|---|
| `EOTP: This operation requires a one-time password` | `NPM_TOKEN` is a granular/publish token; replace with an automation token. |
| `Tag vX.Y.Z does not match package.json version` | You tagged without running `npm version`. Delete the tag (`git tag -d vX.Y.Z && git push --delete origin vX.Y.Z`), run `npm version`, re-push. |
| Publish succeeds but `npm view slideless version` is stale | CDN propagation; usually resolves in 30s. |

### What NOT to do

- **Don't** bump the version by hand-editing `package.json` and then tagging — `npm version` does both atomically and protects against mismatch.
- **Don't** push a tag that points at a commit that isn't on `main`. The workflow doesn't enforce this yet; if you do it accidentally, delete the tag before the workflow completes.
- **Don't** run `npm publish` locally to "fix" a failed CI publish — fix the CI or rotate the token instead, so the npm registry's source of truth stays GitHub Actions.
