interface ImportMetaEnv {
  readonly VITE_EXAM_URL: string
  readonly VITE_APP_ENVIRONMENT?: string
  readonly VITE_API_ANTI_URL: string
  readonly VITE_APP_HMAC_SECRET: string
  readonly VITE_ALLOW_SCREENSHOT?: string
  readonly VITE_ALLOW_DEVTOOLS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
