import Link from 'next/link';

// Shown for addresses outside the app, for example /reports.
export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f8fafc] p-4">
      <div className="p-10 bg-white rounded-2xl shadow-xl border border-slate-100 text-center max-w-md w-full">
        <h1 className="text-2xl font-bold mb-2 text-slate-800">Page not found</h1>
        <p className="text-slate-500 mt-3 mb-8">This address doesn&apos;t match any page in the Team Tracker. The link may be mistyped or out of date.</p>
        <Link
          href="/"
          className="block w-full bg-sky-500 text-white font-semibold py-3 px-4 rounded-lg hover:bg-sky-600 transition-colors shadow-sm"
        >
          Go to Dashboard
        </Link>
      </div>
    </div>
  );
}
