// Shared looks for buttons, boxes and headings, so every page matches.
// Buttons, form fields and boxes all use the same corner rounding (rounded-lg).

const BUTTON = 'rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed';

/** The main action of a form or window: Add, Save, Create, Post. */
export const PRIMARY_BUTTON = `${BUTTON} bg-sky-500 hover:bg-sky-600 text-white`;

/** Every other action: Cancel, Edit, Reset, Export. */
export const SECONDARY_BUTTON = `${BUTTON} bg-white hover:bg-slate-50 text-slate-600 border border-slate-200`;

/** Removing something (inside a window that asks first). */
export const DANGER_BUTTON = `${BUTTON} bg-red-600 hover:bg-red-700 text-white`;

/** A remove action shown next to other actions; it opens a check first. */
export const DANGER_OUTLINE_BUTTON = `${BUTTON} bg-white hover:bg-red-50 text-red-600 border border-red-200`;

/** Button sizes: small inside a row, medium for most buttons, large for the main button of a form. */
export const SMALL_BUTTON = 'px-3 py-1.5 text-[12px]';
export const MEDIUM_BUTTON = 'px-4 py-2 text-[13px]';
export const LARGE_BUTTON = 'px-6 py-2.5 text-[13px]';

/** A white box holding one part of a page. */
export const CARD = 'bg-white rounded-lg border border-slate-200 shadow-sm';

/** A window that opens over the page. */
export const DIALOG = 'bg-white rounded-lg border border-slate-200 shadow-xl';

/** The page title and the line under it (see PageHeader). */
export const PAGE_TITLE = 'text-xl font-extrabold text-slate-800 tracking-tight';
export const PAGE_SUBTITLE = 'text-slate-500 mt-1 text-[13px] font-medium';

/** The heading of one part of a page. */
export const SECTION_TITLE = 'text-[13px] font-bold text-slate-800 uppercase tracking-wider';

/** The heading of a window or side panel. */
export const DIALOG_TITLE = 'text-[15px] font-extrabold text-slate-800';
export const PANEL_TITLE = 'text-lg font-extrabold text-slate-800';
