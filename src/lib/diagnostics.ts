/** Small, local-only breadcrumb trail for failures that reload the page before
 * DevTools can show the original error. No network requests or user location. */
const KEY = 'ep-diagnostics-v1'
const MAX_EVENTS = 40

export interface DiagnosticEvent {
  at: string
  event: string
  detail?: string
}

export function readDiagnostics(): DiagnosticEvent[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(value) ? value as DiagnosticEvent[] : []
  } catch {
    return []
  }
}

export function recordDiagnostic(event: string, detail?: string): void {
  try {
    const entry: DiagnosticEvent = { at: new Date().toISOString(), event }
    if (detail) entry.detail = detail.slice(0, 300)
    localStorage.setItem(KEY, JSON.stringify([...readDiagnostics(), entry].slice(-MAX_EVENTS)))
  } catch {
    // Storage can be disabled; diagnostics must never affect the app.
  }
}

export function installDiagnostics(): void {
  recordDiagnostic('boot')
  window.addEventListener('error', (event) => {
    recordDiagnostic('window-error', event.message)
  })
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason
    recordDiagnostic('unhandled-rejection', reason instanceof Error ? reason.message : String(reason))
  })
  window.addEventListener('pagehide', () => recordDiagnostic('pagehide'))
  ;(window as unknown as { __earthPulseDiagnostics?: () => DiagnosticEvent[] }).__earthPulseDiagnostics = readDiagnostics
}
