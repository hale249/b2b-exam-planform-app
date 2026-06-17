// App display name per environment, driven by VITE_APP_ENVIRONMENT (same env
// flag the web app uses: 'production' | 'staging' | 'development' | 'local').
// Production is the base name; other environments append a suffix:
//   production   -> "Prep Exam Platform"
//   staging      -> "Prep Exam Platform Stg"
//   development  -> "Prep Exam Platform Dev"
//   local        -> "Prep Exam Platform Local"
// Anything unset/unknown falls back to the base name.
const BASE_NAME = 'Prep Exam Platform'
const SUFFIX_BY_ENV: Record<string, string> = {
  staging: 'Stg',
  development: 'Dev',
  local: 'Local'
}

export const getAppName = (): string => {
  const env = import.meta.env.VITE_APP_ENVIRONMENT || ''
  const suffix = SUFFIX_BY_ENV[env]
  return suffix ? `${BASE_NAME} ${suffix}` : BASE_NAME
}
