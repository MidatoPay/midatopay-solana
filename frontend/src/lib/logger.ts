const isDebugEnabled = process.env.NEXT_PUBLIC_DEBUG_LOGS === 'true'

export function debugLog(...args: unknown[]) {
  if (isDebugEnabled) {
    console.log(...args)
  }
}

export function debugWarn(...args: unknown[]) {
  if (isDebugEnabled) {
    console.warn(...args)
  }
}
