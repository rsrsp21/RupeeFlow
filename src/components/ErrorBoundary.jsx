'use client';
// Without this, an uncaught render error in any view unmounts the entire
// React tree — the app goes blank and stays that way until a hard reload,
// since nothing above catches it. Scoped per-view (keyed by resetKey, the
// active view id) so switching tabs recovers on its own; a manual reload
// is still offered in case the error follows you to every view.
import { Component } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('View crashed:', error, info?.componentStack);
  }

  componentDidUpdate(prevProps) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="view-error">
          <AlertTriangle size={22} strokeWidth={1.6} />
          <div>
            <div className="insight-title">Something went wrong loading this screen</div>
            <div className="insight-body">{this.state.error.message || 'Unexpected error'}</div>
          </div>
          <button className="btn primary" style={{ width: 'auto' }} onClick={() => window.location.reload()}>
            <RefreshCw size={14} /> Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
