/** Last line of defence. A render/runtime throw anywhere in the tree would
 * otherwise unmount everything and leave a blank black screen — indistinguish-
 * able from a hard crash. Catch it, show a recovery card, and let the user
 * reload into a fresh WebGL context instead of staring at the void. */

import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // surfaced in the console for debugging; the card is what the user sees
    console.error('Earth Pulse crashed:', error, info.componentStack)
  }

  private reload = (): void => {
    // a full reload is the safest recovery after a GPU / render failure —
    // it rebuilds the renderer and re-uploads every resource from scratch
    window.location.reload()
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children
    return (
      <div
        role="alert"
        style={{
          position: 'fixed',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '1.25rem',
          padding: '2rem',
          textAlign: 'center',
          background: 'radial-gradient(circle at 50% 35%, #0b1220 0%, #000005 70%)',
          color: '#e4e7ec',
          fontFamily: 'system-ui, sans-serif',
          zIndex: 9999,
        }}
      >
        <div style={{ fontSize: '2.5rem' }} aria-hidden>
          🛰️
        </div>
        <h1 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 600 }}>
          Lost signal
        </h1>
        <p style={{ margin: 0, maxWidth: '28rem', opacity: 0.75, lineHeight: 1.5 }}>
          The globe hit an unexpected error and had to stop. This can happen on
          mobile when the GPU runs out of room. Reload to pick the signal back up.
        </p>
        <button
          type="button"
          onClick={this.reload}
          style={{
            marginTop: '0.5rem',
            padding: '0.7rem 1.6rem',
            borderRadius: '999px',
            border: '1px solid #38bdf8',
            background: '#38bdf8',
            color: '#04111f',
            fontSize: '1rem',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Reload
        </button>
      </div>
    )
  }
}
