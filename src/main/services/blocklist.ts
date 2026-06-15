import { BLOCKED_PROCESSES } from '../constants/blocked-processes'
import type { BlockedProcess } from '../types'

let extras: BlockedProcess[] = []

export const setExtraBlockedProcesses = (list: BlockedProcess[]): void => {
  extras = list
}

export const getEffectiveBlockedProcesses = (): BlockedProcess[] => {
  const byName = new Map<string, BlockedProcess>()

  const add = (p: BlockedProcess): void => {
    const name = p.name.trim()
    if (!name || !Array.isArray(p.patterns)) return
    const key = name.toLowerCase()
    const existing = byName.get(key)
    if (existing) {
      existing.patterns = Array.from(new Set([...existing.patterns, ...p.patterns]))
    } else {
      byName.set(key, { name, patterns: [...p.patterns] })
    }
  }

  for (const p of BLOCKED_PROCESSES) add(p)
  for (const p of extras) add(p)

  return Array.from(byName.values())
}
