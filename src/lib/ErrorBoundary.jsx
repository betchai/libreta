import React, { Component } from 'react'
export default class ErrorBoundary extends React.Component {
  state = { error: null }
  static getDerivedStateFromError(error) { return { error } }
  componentDidCatch(error, info) { console.error('ErrorBoundary caught:', error, info) }
  render() {
    if (this.state.error) {
      return (
        <div className="mx-auto max-w-lg mt-20 text-center space-y-4 p-6">
          <h1 className="text-2xl font-bold text-slate-800">Something went wrong</h1>
          <p className="text-sm text-slate-500">{String(this.state.error?.message || this.state.error)}</p>
          <button
            onClick={() => window.location.reload()}
            className="rounded-md bg-destructive px-4 py-2 text-white hover:bg-destructive/90"
          >Reload page</button>
        </div>
      )
    }
    return this.props.children
  }
}
