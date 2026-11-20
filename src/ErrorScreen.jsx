import { Component, useEffect, useState } from 'react'

// Shows startup failures on the page instead of leaving it blank: an error boundary
// around the 3D view, plus a catch-all for uncaught errors and rejected promises
// (asset loads, WebAssembly start-up) that never reach React.

function Message({ title, detail }) {
  return (
    <div role="alert" style={styles.box}>
      <strong style={styles.title}>{title}</strong>
      <code style={styles.detail}>{detail}</code>
      <span style={styles.hint}>Reload the page to try again.</span>
    </div>
  )
}

export class ErrorBoundary extends Component {
  state = { error: null }
  static getDerivedStateFromError(error) {
    return { error }
  }
  render() {
    const { error } = this.state
    if (error) return <Message title="The 3D scene couldn't start" detail={String(error?.message ?? error)} />
    return this.props.children
  }
}

export function GlobalErrors() {
  const [errors, setErrors] = useState([])
  useEffect(() => {
    const add = (detail) => setErrors((list) => (list.includes(detail) ? list : [...list, detail].slice(-3)))
    const onError = (e) => add(String(e.error?.message ?? e.message))
    const onRejection = (e) => add(String(e.reason?.message ?? e.reason))
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)
    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
    }
  }, [])
  if (!errors.length) return null
  return <Message title="Something went wrong while loading" detail={errors.join('\n')} />
}

const styles = {
  box: {
    position: 'absolute',
    top: 16,
    left: 16,
    right: 16,
    maxWidth: 560,
    margin: '0 auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    padding: '14px 16px',
    borderRadius: 10,
    background: '#000000',
    color: '#ffe000',
    font: '13px/1.45 system-ui, sans-serif',
    zIndex: 50,
  },
  title: { fontSize: 15 },
  detail: { color: '#fff', whiteSpace: 'pre-wrap', wordBreak: 'break-word', font: '12px/1.4 ui-monospace, monospace' },
  hint: { opacity: 0.7 },
}
