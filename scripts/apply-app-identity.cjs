// Build the per-environment electron-builder config from the .env file.
//
// VITE_APP_ENVIRONMENT (the same flag the web app uses: production | staging |
// development | local) is the single source of truth for app identity. This reads
// it and writes a generated config (electron-builder.generated.json) — used by
// both local builds and CI — so the name / appId / release type / artifact file
// name all follow the env with no hardcoded values:
//   production   -> "Prep Exam Platform"        | com.prepedu.exam-platform        | prep-exam-platform        | release
//   staging      -> "Prep Exam Platform Stg"    | com.prepedu.exam-platform.stg    | prep-exam-platform-stg    | prerelease
//   development  -> "Prep Exam Platform Dev"    | com.prepedu.exam-platform.dev    | prep-exam-platform-dev    | prerelease
//   local        -> "Prep Exam Platform Local"  | com.prepedu.exam-platform.local  | prep-exam-platform-local  | prerelease
// Anything unset/unknown falls back to production.

const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')
const envPath = path.join(root, '.env')
const basePath = path.join(root, 'electron-builder.json')
const outPath = path.join(root, 'electron-builder.generated.json')

const BASE_NAME = 'Prep Exam Platform'
const BASE_APP_ID = 'com.prepedu.exam-platform'
const BASE_SLUG = 'prep-exam-platform'
const ENVIRONMENTS = {
  production: { suffix: '', appIdSuffix: '', releaseType: 'release' },
  staging: { suffix: 'Stg', appIdSuffix: '.stg', releaseType: 'prerelease' },
  development: { suffix: 'Dev', appIdSuffix: '.dev', releaseType: 'prerelease' },
  local: { suffix: 'Local', appIdSuffix: '.local', releaseType: 'prerelease' }
}

// Minimal .env parse: find VITE_APP_ENVIRONMENT=... and strip surrounding quotes.
const readEnvironment = () => {
  if (!fs.existsSync(envPath)) return ''
  const line = fs
    .readFileSync(envPath, 'utf8')
    .split(/\r?\n/)
    .find((l) => /^\s*VITE_APP_ENVIRONMENT\s*=/.test(l))
  if (!line) return ''
  let value = line.slice(line.indexOf('=') + 1).trim()
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1)
  }
  return value.trim()
}

const env = readEnvironment()
const cfg = ENVIRONMENTS[env] || ENVIRONMENTS.production

// Per-env slug used for build artifact file names: prep-exam-platform[-dev|-stg|-local].
const slug = cfg.appIdSuffix ? `${BASE_SLUG}-${cfg.appIdSuffix.slice(1)}` : BASE_SLUG

// Replace the ${name} token (= package.json name, same for every env) in every
// artifactName with the per-env slug, so each environment produces distinctly
// named installers instead of all being "prep-exam-platform-...".
const patchArtifactNames = (node) => {
  if (!node || typeof node !== 'object') return
  for (const key of Object.keys(node)) {
    if (key === 'artifactName' && typeof node[key] === 'string') {
      node[key] = node[key].replace(/\$\{name\}/g, slug)
    } else {
      patchArtifactNames(node[key])
    }
  }
}

const config = JSON.parse(fs.readFileSync(basePath, 'utf8'))
config.productName = cfg.suffix ? `${BASE_NAME} ${cfg.suffix}` : BASE_NAME
config.appId = `${BASE_APP_ID}${cfg.appIdSuffix}`
config.publish = { ...config.publish, releaseType: cfg.releaseType }
patchArtifactNames(config)
fs.writeFileSync(outPath, JSON.stringify(config, null, 2) + '\n')

console.log(
  `[apply-app-identity] env="${env || '(unset → production)'}" -> ` +
    `productName="${config.productName}" appId="${config.appId}" ` +
    `slug="${slug}" releaseType="${cfg.releaseType}"`
)
