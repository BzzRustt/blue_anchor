// Shown while the admin Server Component streams in (cookie check + auth).
export default function AdminLoading() {
  return (
    <div className="min-h-screen bg-slate-50 animate-pulse">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 flex items-center gap-6">
          {['Analytics', 'Responses', 'Edit Profile'].map((t) => (
            <div key={t} className="py-5">
              <div className="h-3.5 w-20 bg-gray-200 rounded-full" />
            </div>
          ))}
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-6 py-8 space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white border border-gray-200 rounded-xl h-24" />
          ))}
        </div>
        <div className="bg-white border border-gray-200 rounded-xl h-60" />
        <div className="grid grid-cols-2 gap-4">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="bg-white border border-gray-200 rounded-xl h-24" />
          ))}
        </div>
      </main>
    </div>
  )
}
