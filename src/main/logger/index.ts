import { createLogger, LogLevels } from './logger'
import { ConsoleTransport, FileTransport, initFileTransport } from './transports'

export * from './types'
export * from './logger'

// App-wide logger: prints to the console AND writes daily files (see
// FileTransport). Use logger.info/warn/error/debug instead of console.* so
// diagnostics land in the log files for later troubleshooting.
export const logger = createLogger({
  level: LogLevels.debug,
  transports: [ConsoleTransport, FileTransport]
})

// Call once at startup (after app is ready) to set up file logging + retention.
export const initLogger = (): void => {
  initFileTransport()
}
