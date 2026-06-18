import { BLOCKED_PROCESSES } from '../constants/blocked-processes'
import type { BlockedProcess } from '../types'

let extras: BlockedProcess[] = []

// Cache of the effective list with its detection regexes PRE-COMPILED. Building
// the merged list + compiling ~200-300 RegExps is done once here and reused on
// every scan, instead of recompiling them on each process/window scan (every 30s
// AND on every on-demand CHECK_EXAM_SECURITY from the web). Invalidated only when
// the admin extras change (blocklist sync, every 15 min).
export type CompiledBlockedProcess = { name: string; regexes: RegExp[] }
let compiled: CompiledBlockedProcess[] | null = null

export const setExtraBlockedProcesses = (list: BlockedProcess[]): void => {
  extras = list
  compiled = null // rebuilt lazily on the next scan
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

// A pattern matches when it appears as a path/word token in `ps aux` / tasklist
// `g` flag → stateless and safe to reuse across scans; compiled once and cached.
const compilePatterns = (list: BlockedProcess[]): CompiledBlockedProcess[] =>
  list.map((p) => ({
    name: p.name,
    regexes: p.patterns.map(
      (pattern) => new RegExp(`(^|[\\s/\\\\",])${pattern}([\\s.,"\\\\/]|$)`, 'm')
    )
  }))

export const getCompiledBlockedProcesses = (): CompiledBlockedProcess[] => {
  if (!compiled) compiled = compilePatterns(getEffectiveBlockedProcesses())
  return compiled
}
