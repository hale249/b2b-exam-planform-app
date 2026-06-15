import { exec } from 'child_process'

import { getEffectiveBlockedProcesses } from '../services/blocklist'

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

  for (const proc of getEffectiveBlockedProcesses()) {
    for (const pattern of proc.patterns) {
      const regex = new RegExp(`(^|[\\s/\\\\",])${pattern}([\\s.,"\\\\]|$)`, 'm')
      if (regex.test(processOutput)) {
        if (!detected.includes(proc.name)) {
          detected.push(proc.name)
        }
        break
      }
    }
  }

  return detected
}
