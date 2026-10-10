import type { ReactNode } from 'react';
import { PAGE_SUBTITLE, PAGE_TITLE } from '../utils/styles';

// The title block at the top of every page: the title, a line about the page, and optional buttons on the right.
export function PageHeader({ title, subtitle, children }: { title: ReactNode; subtitle?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-slate-200 pb-4">
      <div>
        <h1 className={PAGE_TITLE}>{title}</h1>
        {subtitle && <p className={PAGE_SUBTITLE}>{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}
