interface ImportMetaEnv {
  readonly VITE_EXAM_URL: string
  readonly VITE_APP_NAME: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
