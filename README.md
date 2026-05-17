# slideless

The official CLI for [Slideless](https://slideless.ai) — push, pull, share, and collaborate on HTML presentations from your terminal.

## Install

```bash
npm install -g slideless
```

## Quickstart

```bash
# 1. Authenticate
slideless login
# (paste your cko_ key from the dashboard — or use `slideless auth signup-request`
# + `signup-complete` to create an account from the terminal)

# 2a. Push a folder with assets (images, video, 3D models, CSS, JS)
slideless push ./my-deck --title "Q3 Pitch"
# → Creates the presentation and writes slideless.json into the folder.

# 2b. Or push a single HTML file
slideless push ./my-deck.html --title "Q3 Pitch"

# 3. Update in place — run push again from a folder that already has
#    slideless.json. The version is bumped; unchanged assets are
#    deduplicated by SHA-256.
slideless push ./my-deck

# 4. Mint a public viewer URL
slideless share <shareId>
slideless share <shareId> --name "Acme" --to-version 2   # named + pinned

# 5. Pin an existing token to a specific version
slideless pin <shareId> <tokenId> --to-version 2
slideless pin <shareId> <tokenId> --latest               # undo

# 6. List your presentations
slideless list

# 7. See details (including per-token view counts + version modes)
slideless get <shareId>
```

## Authentication

Two ways to get a `cko_` API key:

1. **From the terminal (signup / login without a browser).** Email-based OTP flow, designed to work from CI or from an agent:

   ```bash
   # First time — creates account, org, and API key in one go
   slideless auth signup-request --email you@example.com
   # (check inbox for 6-digit code)
   slideless auth signup-complete --email you@example.com --code 123456 --first-name Jane

   # Existing account — mints a fresh API key
   slideless auth login-request --email you@example.com
   slideless auth login-complete --email you@example.com --code 123456
   ```

   The API key is saved as a profile in `~/.config/slideless/config.json` and set as active automatically. Pass `--company "Acme"`, `--description "..."`, `--brand-primary "#hex"`, `--logo ./logo.png`, etc. to `signup-complete` to fill org details (all optional).

2. **From the dashboard.** Paste the key from `https://app.slideless.ai` → **API Keys** into `slideless login`.

Three ways to provide a key, resolved in this order:

1. `--api-key <key>` flag
2. `SLIDELESS_API_KEY` environment variable
3. Active profile saved by `slideless login` / `slideless auth signup-complete` / `slideless auth login-complete` (stored at `~/.config/slideless/config.json`, mode 0600)

## Profiles

Switch between multiple keys (e.g., personal vs team org):

```bash
slideless login --name personal
slideless login --name work
slideless use            # list profiles
slideless use work       # switch active
slideless whoami         # show current identity
```

## Machine-readable output

Every command supports `--json` for stable, scriptable output:

```bash
slideless list --json
slideless push ./deck.html --title "Demo" --json
```

JSON shape:

```json
{ "success": true, "data": { ... } }
```

or on failure:

```json
{ "success": false, "error": { "code": "...", "message": "..." } }
```

## Commands

| Command | What it does |
|---|---|
| `slideless auth signup-request --email X` | Email a signup OTP to a new user. Refuses if the email already has an org. |
| `slideless auth signup-complete --email X --code 123456 --first-name Jane` | Verify the OTP; create user + org + API key; save as active profile. |
| `slideless auth login-request --email X` | Email a login OTP to an existing user. |
| `slideless auth login-complete --email X --code 123456` | Verify the OTP; mint a fresh API key; save as active profile. |
| `slideless login` | Save an API key and verify it (paste from dashboard). |
| `slideless logout [name]` | Remove a profile. |
| `slideless whoami` | Show the active identity. |
| `slideless use [name]` | List or switch profiles. |
| `slideless verify` | Validate the active key against the backend. |
| `slideless push [path]` | Upload a deck (folder or `.html`). New presentations need `--title`; updates read `slideless.json`. `--entry <file>` sets the entry HTML in folder mode (default `index.html`). `--force` bypasses the version-conflict check. `--strict` fails on unresolved refs. |
| `slideless pull <shareId> [path]` | Download a presentation into a local folder. `--at <N>` pulls a specific version; `--force` overwrites a non-empty destination. |
| `slideless share <shareId>` | Mint a public viewer token. `--name "..."` labels it; `--to-version <N>` pins it to a version. |
| `slideless unshare <shareId>` | Revoke a single token (`--token <tokenId>`), or archive the whole presentation. |
| `slideless share-email <shareId> --to <email>` | Email a deck to recipients with per-recipient tracked tokens. |
| `slideless invite <shareId>` | Invite a collaborator (editor access). |
| `slideless uninvite <shareId> <collaboratorId>` | Revoke a collaborator. |
| `slideless delete <shareId>` | Delete a presentation. |
| `slideless list` | List your presentations. |
| `slideless get <shareId>` | Show details for one presentation, including per-token view counts and version modes. |
| `slideless pin <shareId> <tokenId>` | Pin a token to a version (`--to-version <N>`) or follow latest (`--latest`). |
| `slideless publish` | Publish the current deck (linked via `slideless.json`) to the marketplace. `--to-version <N>` pins a specific version. |
| `slideless unpublish <slug>` | Remove a marketplace listing. |
| `slideless remix <slug> [path]` | Clone a marketplace listing into a local folder. |
| `slideless search [query]` | Search the marketplace. |
| `slideless listing get\|update <slug>` | Inspect or update a marketplace listing. |
| `slideless star\|unstar <slug>` · `slideless stars` | Star, unstar, or list starred listings. |
| `slideless config show\|set\|clear` | Manage the config file. |
| `slideless completion bash\|zsh\|fish` | Generate shell completion scripts. |

### Error codes for agents

Every `auth` command supports `--json` and returns a stable error shape with a `nextAction` string an agent can parse and follow:

```json
{
  "success": false,
  "status": 409,
  "error": {
    "code": "USER_ALREADY_HAS_ORGANIZATION",
    "message": "This email already has an organization.",
    "nextAction": "Run `slideless auth login-request --email you@example.com` to get a new API key instead."
  }
}
```

Common codes: `EMAIL_INVALID`, `OTP_RESEND_COOLDOWN` (wait ~30 s), `OTP_NOT_FOUND`, `OTP_EXPIRED`, `OTP_INVALID`, `OTP_ALREADY_USED`, `OTP_LOCKED_OUT`, `OTP_PURPOSE_MISMATCH`, `USER_ALREADY_HAS_ORGANIZATION`, `USER_NOT_FOUND`, `USER_HAS_NO_ORGANIZATION`, `COMPANY_NAME_TOO_LONG`, `BRAND_COLOR_INVALID`, `LOGO_TOO_LARGE`, `LOGO_INVALID_FORMAT`, `LOGO_DECODE_FAILED`, `INVALID_EXPIRES_IN_DAYS`, `INTERNAL`.

## Configuration

Stored at `~/.config/slideless/config.json` (or `$XDG_CONFIG_HOME/slideless/config.json`). Permission `0600`. Created automatically by `slideless login`.

| Env var | Purpose |
|---|---|
| `SLIDELESS_API_KEY` | API key (overrides active profile). |
| `SLIDELESS_API_BASE_URL` | Override backend URL (e.g. for staging or a local emulator). |

The backend URL can also be overridden per command with `--api-url <url>`.

## License

MIT
