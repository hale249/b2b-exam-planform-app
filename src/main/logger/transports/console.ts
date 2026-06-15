/* eslint-disable no-console -- this transport's whole job is to write to the console */
import { Logger } from '../types'

export const ConsoleTransport: Logger = {
  level: 'debug',
  setLevel(level): void {
    ConsoleTransport.level = level
  },
  error(...args): void {
    console.error('[ExamApp][error]', ...args)
  },
  warn(...args): void {
    console.warn('[ExamApp][warn]', ...args)
  },
  info(...args): void {
    console.log('[ExamApp][info]', ...args)
  },
  debug(...args): void {
    console.log('[ExamApp][debug]', ...args)
  }
}
