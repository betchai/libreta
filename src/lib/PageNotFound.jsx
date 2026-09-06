import { Link } from 'react-router-dom'
export default function PageNotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-4">
      <h1 className="text-4xl font-bold text-slate-800">404</h1>
      <p className="text-slate-500">Page not found</p>
      <Link to="/" className="text-pink underline">Go home</Link>
    </div>
  )
}
