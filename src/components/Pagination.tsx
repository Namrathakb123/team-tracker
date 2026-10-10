import type { Dispatch, SetStateAction } from 'react';

// The bar under a list: "Page X of Y" with previous / next buttons. Shows nothing when everything fits on one page.
export function Pagination({ page, totalPages, setPage }: { page: number; totalPages: number; setPage: Dispatch<SetStateAction<number>> }) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex justify-center items-center gap-3 p-4 border-t border-slate-100 bg-slate-50/50">
      <button
        disabled={page === 1}
        onClick={() => setPage(p => Math.max(p - 1, 1))}
        aria-label="Previous page"
        className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed text-slate-500 cursor-pointer shadow-sm transition-all"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
      </button>
      <span className="text-xs font-semibold text-slate-600 font-sans">
        Page <span className="font-extrabold text-sky-600">{page}</span> of <span className="font-extrabold text-slate-800">{totalPages}</span>
      </span>
      <button
        disabled={page >= totalPages}
        onClick={() => setPage(p => Math.min(p + 1, totalPages))}
        aria-label="Next page"
        className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed text-slate-500 cursor-pointer shadow-sm transition-all"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
      </button>
    </div>
  );
}
