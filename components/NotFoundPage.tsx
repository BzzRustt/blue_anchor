export default function NotFoundPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-white">
      <div className="text-center space-y-3">
        <h1 className="text-5xl font-semibold text-gray-800">404</h1>
        <p className="text-gray-400 text-base">Page not found</p>
        <a
          href="/"
          className="inline-block text-sm text-gray-400 hover:text-gray-600 underline underline-offset-2 transition-colors"
        >
          Go home
        </a>
      </div>
    </main>
  )
}
