import { exec } from 'child_process'

import { getCompiledBlockedProcesses } from '../services/blocklist'

export const getRunningProcesses = (): Promise<string> => {
  return new Promise((resolve, reject) => {
    const command = process.platform === 'win32' ? 'tasklist /FO CSV /NH' : 'ps aux'

    exec(command, { maxBuffer: 1024 * 1024 * 5 }, (error, stdout) => {
      if (error) {
        reject(error)
        return
      }
      resolve(stdout)
    })
  })
}

export const findBlockedProcesses = (processOutput: string): string[] => {
  const detected: string[] = []

  // Pre-compiled, cached regexes (see blocklist.ts) — no per-scan compilation.
  for (const proc of getCompiledBlockedProcesses()) {
    for (const regex of proc.regexes) {
      if (regex.test(processOutput)) {
        detected.push(proc.name)
        break
      }
    }
  }

  return detected
}
