import { readdir, stat, unlink } from 'fs/promises'
import { join } from 'path'

import log from 'electron-log/main'
import { app } from 'electron'

import { Logger } from '../types'

// Daily log files in <userData>/logs, rotated at maxSize, with old files pruned
// past the retention window — modelled on the self-service-app NativeLogger
// (electron-log) plus the age-based cleanup it lacked.
const MAX_SIZE = 10 * 1024 * 1024 // 10 MB per file, then electron-log rotates
const RETENTION_DAYS = 14
const FILE_SUFFIX = '-exam-app.log'

let logDir = ''
let currentDate = ''

const today = (): string => {
  const d = new Date()
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

const logFilePath = (date: string): string => join(logDir, `${date}${FILE_SUFFIX}`)

// Keep writing to today's file; roll over to a new file when the day changes.
const ensureCurrentDay = (): void => {
  const t = today()
  if (t !== currentDate) {
    currentDate = t
    log.transports.file.resolvePathFn = (): string => logFilePath(currentDate)
  }
}

const pruneOldLogs = async (): Promise<void> => {
  try {
    const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000
    for (const name of await readdir(logDir)) {
      if (!name.endsWith('.log') && !name.endsWith('.log.old')) continue
      const full = join(logDir, name)
      const info = await stat(full)
      if (info.mtimeMs < cutoff) await unlink(full)
    }
  } catch {
    // logs dir not created yet / unreadable — nothing to prune
  }
}

export const initFileTransport = (): void => {
  logDir = join(app.getPath('userData'), 'logs')
  currentDate = today()
  log.transports.file.maxSize = MAX_SIZE
  log.transports.file.resolvePathFn = (): string => logFilePath(currentDate)
  // We print to the console via ConsoleTransport, so silence electron-log's own
  // console transport to avoid double output.
  log.transports.console.level = false
  // Route uncaught exceptions / rejections into the log file too.
  log.errorHandler.startCatching({ showDialog: false })
  void pruneOldLogs()
}

export const FileTransport: Logger = {
  level: 'debug',
  setLevel(level): void {
    FileTransport.level = level
  },
  error(...args): void {
    ensureCurrentDay()
    log.error(...args)
  },
  warn(...args): void {
    ensureCurrentDay()
    log.warn(...args)
  },
  info(...args): void {
    ensureCurrentDay()
    log.info(...args)
  },
  debug(...args): void {
    ensureCurrentDay()
    log.debug(...args)
  }
}
