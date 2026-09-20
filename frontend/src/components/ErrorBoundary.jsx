import React from 'react'

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary] Caught error:', error, errorInfo)
  }

  handleReload = () => {
    window.location.reload()
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[50vh] flex items-center justify-center p-6">
          <div
            className="card-cyber max-w-lg w-full p-6 rounded-lg text-center font-mono border-2 border-neon-danger shadow-2xl"
            style={{
              background: '#0e0505',
              boxShadow: '0 0 30px rgba(255, 34, 68, 0.3)',
            }}
          >
            <div className="text-4xl mb-3">⚠️</div>
            <h2 className="text-lg font-bold text-neon-danger uppercase tracking-wider mb-2">
              Erreur d'affichage du Dialer
            </h2>
            <p className="text-xs text-text-muted mb-4">
              Une erreur inattendue est survenue lors de l'affichage de ce panneau.
            </p>

            <div className="bg-black/80 border border-neon-danger/30 rounded p-3 text-left mb-6 overflow-x-auto text-[0.7rem] text-red-300">
              {this.state.error?.message || String(this.state.error)}
            </div>

            <div className="flex gap-3 justify-center">
              <button
                type="button"
                onClick={this.handleReset}
                className="px-4 py-2 text-xs font-bold rounded border border-neon-green text-neon-green bg-neon-green/10 hover:bg-neon-green/20 transition-all cursor-pointer"
              >
                ↻ RÉESSAYER
              </button>
              <button
                type="button"
                onClick={this.handleReload}
                className="px-4 py-2 text-xs font-bold rounded border border-white/20 text-white bg-white/5 hover:bg-white/10 transition-all cursor-pointer"
              >
                RECHARGER LA PAGE
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
