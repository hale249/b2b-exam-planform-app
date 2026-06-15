interface ImportMetaEnv {
  readonly VITE_EXAM_URL: string
  readonly VITE_APP_NAME: string
  readonly VITE_API_ANTI_URL: string
  readonly VITE_APP_HMAC_SECRET: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
