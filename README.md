# B2B Exam Platform App

Electron desktop app for an online exam platform with anti-cheating safeguards (kiosk lockdown, blocked-process detection, screen-capture protection, native event tracking). Built with Electron + Vue 3 + Vite + TypeScript + TailwindCSS.

## Requirements

- **Node.js**: `22` (required — CI builds on Node 22; other major versions are not supported).
- **Package manager**: `pnpm` (recommended — the repo ships `pnpm-workspace.yaml` and `pnpm-lock.yaml`) or `npm`.
- **OS**: macOS, Windows, or Linux.
- Building an installer for a given platform requires running on that same OS (or a configured cross-build).

## Installation

```bash
# Clone the repo (if you haven't already)
git clone <repo-url>
cd b2b-exam-planform-app

# Install dependencies
pnpm install
# or
npm install
```

## Environment configuration

Create a `.env` file in the project root (copy from `.env.example`):

```bash
cp .env.example .env
```

Variables:

| Variable | Required | Description |
| --- | --- | --- |
| `VITE_APP_ENVIRONMENT` | optional | `production` \| `staging` \| `development` \| `local`. Drives the app identity (window title, installed app name, `appId`, and the auto-update release channel). Defaults to `production`. |
| `VITE_EXAM_URL` | **yes** | URL of the exam page loaded inside the Electron window. |
| `VITE_API_ANTI_URL` | yes | Base URL of the anti-cheating API (event tracking / blocklist sync). |
| `VITE_APP_HMAC_SECRET` | yes | HMAC secret used to sign anti-cheating client requests. Keep secret — never commit a real value. |
| `VITE_ALLOW_SCREENSHOT` | optional | `"true"` disables screen-capture protection (screenshots/recording) for dev/QA. **Must be `"false"` (or empty) in builds shipped to students.** |
| `VITE_ALLOW_DEVTOOLS` | optional | `"true"` keeps DevTools available in a packaged build (F12 / Cmd+Shift+I toggles it). **Must be `"false"` (or empty) in shipped builds.** |

> `.env` is gitignored. Do not place real secrets (e.g. `VITE_APP_HMAC_SECRET`) in `.env.example`.

## Development

```bash
pnpm dev
# or
npm run dev
```

Starts the Vite dev server together with Electron, with hot-reload for the `main`, `preload`, and `renderer` processes.

## Production build

```bash
# Build assets only (Vite) — no installer
pnpm build

# Build and run the unpackaged app (debugging, no installer)
pnpm build:unpack

# Package an installer per platform
pnpm build:win     # Windows (NSIS .exe, x64)
pnpm build:mac     # macOS (.dmg + .zip, x64 + arm64)
pnpm build:linux   # Linux (AppImage, x64)
```

Each packaging step runs the full pipeline: Vite build → V8 bytecode compile → app-identity generation (`electron-builder.generated.json` from your `.env`) → `electron-builder`. Output is written to `dist/`.

Releases are produced by GitHub Actions on tag push: `v*` → production, `stg_v*` → staging, `dev_v*` → dev (the channel is encoded in the version's prerelease tag), then published to GitHub Releases for auto-update.

## Project structure

```
.
├── build/                  # electron-builder resources (entitlements, icon, ...)
├── resources/              # Runtime resources bundled with the app
├── scripts/                # Build helpers (bytecode compile, app-identity)
├── src/
│   ├── main/               # Electron main process
│   │   ├── handlers/       #   IPC handlers
│   │   ├── services/       #   anti-cheat, blocklist, network status, ...
│   │   └── index.ts        #   main entry
│   ├── preload/            # Preload scripts (main ↔ renderer bridge, overlays)
│   ├── renderer/           # Vue 3 app (UI)
│   └── shared/             # Shared constants (IPC channels, ...)
├── electron-builder.json   # Packaging config (base; CI uses the generated copy)
├── vite.config.ts          # Vite + Electron plugin config
└── package.json
```

## Useful scripts

| Script | Description |
| --- | --- |
| `pnpm dev` | Run the app in development mode |
| `pnpm clean` | Remove `dist/` and `dist-electron/` |
| `pnpm build` | Clean + build production assets |
| `pnpm build:unpack` | Build and emit the unpackaged app (debug) |
| `pnpm build:win` / `:mac` / `:linux` | Package an installer per platform |
| `pnpm start` | Run Electron against the current build |
| `pnpm typecheck` | Type-check the main/preload/shared sources |
| `pnpm lint` / `pnpm lint:fix` | Lint (and auto-fix) |
| `pnpm format` / `pnpm format:check` | Format with Prettier |

## Troubleshooting

- **Electron won't start after `pnpm dev`**: ensure Node.js is `22`; delete `node_modules` and reinstall.
- **Exam page doesn't load**: check that `VITE_EXAM_URL` in `.env` points to the correct URL.
- **macOS code-signing errors**: try `pnpm build:unpack` first; distribution builds require an Apple Developer certificate configured for `electron-builder`.
- **Full reset**: `pnpm clean && rm -rf node_modules && pnpm install`.
