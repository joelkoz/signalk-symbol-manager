import ReactDOM from 'react-dom/client'
import { App } from './App'
import './styles.css'

// Note: intentionally NOT wrapped in <React.StrictMode>. StrictMode double-
// invokes effects in development, which mounts/disposes the Fabric.js canvas
// twice and corrupts the imperatively-managed editor canvas. (Production React
// never double-invokes, so this only affects dev.)
ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(<App />)
