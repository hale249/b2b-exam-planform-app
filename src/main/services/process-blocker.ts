import { findBlockedProcesses, getRunningProcesses } from '../utils'

export const checkBlockedProcesses = async (): Promise<string[]> => {
  try {
    const output = await getRunningProcesses()
    return findBlockedProcesses(output)
  } catch (error) {
    console.error('Error checking processes:', error)
    return []
  }
}
