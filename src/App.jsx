import { Component } from 'react';
import DimaTradingOS from './DimaTradingOS';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error('[ErrorBoundary] Render crash:', error);
    console.error('[ErrorBoundary] Component stack:', info.componentStack);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ background:'#0d1117', color:'#f85149', padding:40, fontFamily:'monospace', fontSize:13 }}>
          <div style={{ fontSize:20, marginBottom:16 }}>⚠️ React Render Error</div>
          <pre style={{ whiteSpace:'pre-wrap', color:'#c9d1d9', background:'#161b22', padding:16, borderRadius:8 }}>
            {this.state.error.toString()}
            {'\n\n'}
            {this.state.error.stack}
          </pre>
          <div style={{ marginTop:16, color:'#8b949e' }}>Check DevTools Console for full details.</div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <DimaTradingOS />
    </ErrorBoundary>
  );
}
