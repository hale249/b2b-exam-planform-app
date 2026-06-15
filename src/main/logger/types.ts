// Logger abstraction mirrored from the self-service-app reference: a small
// facade with pluggable transports (console, file, ...). Adapted to run in the
// Electron MAIN process (no renderer→IPC hop needed here).

export interface LogFn {
  (...args: Array<unknown>): void
}

export interface Logger {
  level?: string
  setLevel(level: string): void
  error: LogFn
  warn: LogFn
  info: LogFn
  debug: LogFn
}

export interface LoggerContext {
  logger: LoggerInstance | null
  level: string
  transports: Array<Logger>
}

export interface LoggerInstance extends Logger {
  level: string
  transports: Array<Logger>
  addTransport(logger: Logger): void
  _context: LoggerContext
}

export interface LoggerConfig {
  level?: string
  transports?: Array<Logger>
}
