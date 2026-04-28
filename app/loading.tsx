// Shown by Next.js Suspense while app/page.tsx streams in.
// Matches the ScannerPage layout so the transition feels seamless.
export default function Loading() {
  return (
    <div className="min-h-screen animate-pulse" style={{ backgroundColor: '#f9f6f1' }}>
      {/* Progress bar placeholder */}
      <div className="fixed top-0 left-0 right-0 h-[3px] bg-stone-200" />

      <div className="max-w-md mx-auto px-5 pt-10 pb-16">
        {/* Top notice line */}
        <div className="h-3 w-44 bg-stone-200 rounded-full mx-auto mb-8" />

        {/* Avatar + name + bio */}
        <div className="flex flex-col items-center text-center mb-8 space-y-4">
          <div className="w-24 h-24 rounded-full bg-stone-200" />
          <div className="space-y-2.5 w-full">
            <div className="h-7 w-36 bg-stone-200 rounded-full mx-auto" />
            <div className="h-4 w-64 bg-stone-200 rounded-full mx-auto" />
            <div className="h-4 w-52 bg-stone-200 rounded-full mx-auto" />
          </div>
        </div>

        <div className="h-px bg-stone-200 mb-5" />

        {/* Poll card */}
        <div className="bg-white rounded-2xl p-6 shadow-sm space-y-4 mb-5">
          <div className="h-4 w-48 bg-stone-200 rounded-full" />
          <div className="h-12 w-12 bg-stone-200 rounded-full mx-auto" />
          <div className="h-3 w-full bg-stone-200 rounded-full" />
          <div className="flex justify-between">
            <div className="h-3 w-16 bg-stone-200 rounded-full" />
            <div className="h-3 w-16 bg-stone-200 rounded-full" />
          </div>
        </div>

        <div className="h-px bg-stone-200 mb-5" />

        {/* Note card */}
        <div className="bg-white rounded-2xl p-6 shadow-sm space-y-3 mb-5">
          <div className="h-3 w-72 bg-stone-200 rounded-full" />
          <div className="h-3 w-56 bg-stone-200 rounded-full" />
          <div className="h-24 bg-stone-200 rounded-xl mt-2" />
          <div className="h-10 bg-stone-200 rounded-xl" />
        </div>

        {/* Submit button */}
        <div className="h-14 bg-stone-200 rounded-2xl" />
      </div>
    </div>
  )
}
