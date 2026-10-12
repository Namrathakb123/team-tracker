'use client'

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { Sidebar } from '../components/Sidebar';
import { DashboardView } from '../components/DashboardView';
import { MeetingsView } from '../components/MeetingsView';
import { MeetingsProvider } from '../context/MeetingsContext';
import { MeetingBanner } from '../components/MeetingBanner';
import { TasksView } from '../components/TasksView';
import { MemberWorkView } from '../components/MemberWorkView';
import { ClientsView } from '../components/ClientsView';
import { LeadsView } from '../components/LeadsView';
import { TeamView } from '../components/TeamView';
import { CustomizeView } from '../components/CustomizeView';
import { AuditLogsView } from '../components/AuditLogsView';
import { Logo } from '../components/Logo';
import { SignInScreen } from '../components/SignInScreen';
import { ChoosePasswordScreen } from '../components/PasswordForms';
import { routeFromQuery, queryFor, extraParams } from '../utils/routes';
import { localDateKey } from '../utils/dates';
import { ConfirmProvider } from '../components/ConfirmDialog';
import { PRIMARY_BUTTON, SECONDARY_BUTTON, MEDIUM_BUTTON, CARD, PAGE_TITLE } from '../utils/styles';

export default function Home() {
  // The open page is read from the address, which needs a Suspense boundary (see the Next.js useSearchParams docs).
  return (
    <ConfirmProvider>
      <Suspense fallback={<SignInScreen onSignIn={() => {}} error={null} />}>
        <AppShell />
      </Suspense>
    </ConfirmProvider>
  );
}

function LoadingScreen({ text }: { text?: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f8fafc]">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-3 border-teal-500 border-t-transparent rounded-full animate-spin" />
        {text && <div className="text-sm font-medium text-slate-500">{text}</div>}
      </div>
    </div>
  );
}

function AppShell() {
  const { user, loading, login, logout, isApproved, isAdmin, accessError, loginError, mustChangePassword, chooseFirstPassword, recheckSignIn, testData } = useAuth();
  const { loaded: dataLoaded, loadError, retryLoad, saveError, clearSaveError, saveState } = useData();
  // Which page is open comes from the address (see utils/routes.ts), so Refresh, Back and shared links work.
  const addressQuery = useSearchParams().toString();
  // Next.js reports a new address a moment after a link is followed. Until then, show the page that was just
  // opened, so it appears together with any data change made by the same click (for example removing a client).
  const [openingQuery, setOpeningQuery] = useState<string | null>(null);
  const [lastAddressQuery, setLastAddressQuery] = useState(addressQuery);
  if (lastAddressQuery !== addressQuery) {
    setLastAddressQuery(addressQuery);
    setOpeningQuery(null);
  }
  const query = openingQuery ?? addressQuery;
  // Values passed along with the last link that are not part of its address (for example the text for a new issue).
  // They only apply while that address is open.
  const [extra, setExtra] = useState<{ query: string; params: any } | null>(null);
  const route = useMemo(() => {
    const fromAddress = routeFromQuery(query);
    if (extra && extra.query === query) return { view: fromAddress.view, params: { ...extra.params, ...fromAddress.params } };
    return fromAddress;
  }, [query, extra]);
  const mainRef = useRef<HTMLElement>(null);
  const [globalDate, setGlobalDate] = useState(() => localDateKey());
  // Phone-sized screens: whether the slide-in menu is open.
  const [menuOpen, setMenuOpen] = useState(false);

  // Escape closes the phone menu.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  // If the app is left open past midnight while showing today, move on to the new day.
  useEffect(() => {
    let today = localDateKey();
    const timer = setInterval(() => {
      const now = localDateKey();
      if (now !== today) {
        const previous = today;
        setGlobalDate(current => (current === previous ? now : current));
        today = now;
      }
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  // A newly opened page starts at the top.
  useEffect(() => {
    mainRef.current?.scrollTo(0, 0);
  }, [query]);

  // On this computer only ("npm run dev"), /?preview=sign-in shows the sign-in page without signing out.
  if (process.env.NODE_ENV === 'development' && new URLSearchParams(addressQuery).get('preview') === 'sign-in') {
    return <SignInScreen onSignIn={() => {}} error={null} preview />;
  }

  if (!user) {
    return <SignInScreen onSignIn={login} error={loginError} />;
  }

  if (loading) {
    return <LoadingScreen />;
  }

  // Signed in with a starting password from an admin: they choose their own before anything else.
  if (mustChangePassword) {
    return <ChoosePasswordScreen email={user.email || ''} onSave={chooseFirstPassword} onSignOut={logout} />;
  }

  // Signed in, but the login doesn't give access to the app: show nothing from the app.
  if (accessError || !isApproved) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f8fafc] p-4">
        <div className="p-10 bg-white rounded-2xl shadow-xl border border-slate-100 text-center max-w-md w-full">
          <h1 className="text-2xl font-bold mb-2 text-slate-800">You don&apos;t have access</h1>
          <p className="text-slate-600 mt-3">
            You&apos;re signed in as <span className="font-semibold text-slate-800 break-all">{user.email}</span>.
          </p>
          <p className="text-slate-500 mt-3 mb-8">
            {accessError || 'Your login doesn’t give you access to the Team Tracker.'} Once it&apos;s fixed, click Check again.
          </p>
          <div className="flex flex-col gap-3">
            <button
              onClick={recheckSignIn}
              className={`w-full ${PRIMARY_BUTTON} py-3 px-4 shadow-sm`}
            >
              Check again
            </button>
            <button
              onClick={logout}
              className={`w-full ${SECONDARY_BUTTON} py-3 px-4`}
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Loading data failed: never show the app with empty lists, because saving from there could wipe the database.
  if (loadError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f8fafc] p-4">
        <div className="p-10 bg-white rounded-2xl shadow-xl border border-slate-100 text-center max-w-md w-full">
          <h1 className="text-2xl font-bold mb-2 text-slate-800">Couldn&apos;t load your data</h1>
          <p className="text-slate-600 mt-3 mb-2">{loadError}</p>
          <p className="text-slate-500 mb-8">Nothing has been changed. Your data is safe.</p>
          <div className="flex flex-col gap-3">
            <button
              onClick={retryLoad}
              className={`w-full ${PRIMARY_BUTTON} py-3 px-4 shadow-sm`}
            >
              Try again
            </button>
            <button
              onClick={logout}
              className={`w-full ${SECONDARY_BUTTON} py-3 px-4`}
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Data is still on its way: wait instead of showing empty pages.
  if (!dataLoaded) {
    return <LoadingScreen />;
  }

  // Opens a page by changing the address. The browser keeps each address in its history, so Back returns to it.
  const navigateTo = (view: string, params?: any) => {
    const nextQuery = queryFor(view, params);
    const extras = extraParams(view, params);
    setExtra(extras ? { query: nextQuery, params: extras } : null);
    if (nextQuery !== query) {
      setOpeningQuery(nextQuery);
      window.history.pushState(null, '', nextQuery ? `?${nextQuery}` : window.location.pathname);
    }
    setMenuOpen(false);
  };

  const adminOnly = (
    <div className={`${CARD} p-8 text-center text-slate-500`}>
      This page is for admins only.
    </div>
  );

  const renderView = () => {
    switch (route.view) {
      case 'dashboard': return <DashboardView globalDate={globalDate} navigateTo={navigateTo} />;
      case 'meeting': return <MeetingsView globalDate={globalDate} routeParams={route.params} navigateTo={navigateTo} />;
      case 'issues': return <TasksView routeParams={route.params} navigateTo={navigateTo} />;
      case 'work': return <MemberWorkView memberId={route.params?.selectedMemberId || null} navigateTo={navigateTo} />;
      case 'clients': return <ClientsView routeParams={route.params} navigateTo={navigateTo} globalDate={globalDate} />;
      case 'leads': return <LeadsView routeParams={route.params} navigateTo={navigateTo} />;
      case 'team': return <TeamView navigateTo={navigateTo} />;
      case 'customize': return isAdmin ? <CustomizeView /> : adminOnly;
      // The old User Panel is now part of the Team page (logins are managed there).
      case 'admin': return <TeamView navigateTo={navigateTo} />;
      case 'audit': return isAdmin ? <AuditLogsView /> : adminOnly;
      // The address names a page that doesn't exist (for example a mistyped or old link).
      default: return (
        <div className={`${CARD} p-8 text-center`}>
          <h1 className={PAGE_TITLE}>Page not found</h1>
          <p className="text-slate-500 mt-2 text-[13px]">This address doesn&apos;t match any page in the Team Tracker. The link may be mistyped or out of date.</p>
          <button
            onClick={() => navigateTo('dashboard')}
            className={`mt-5 ${PRIMARY_BUTTON} ${MEDIUM_BUTTON}`}
          >
            Go to Dashboard
          </button>
        </div>
      );
    }
  };

  return (
    // The meetings are loaded once for the whole app (the Meetings page, the reminder and the Dashboard use them).
    <MeetingsProvider>
    <div className="flex h-screen bg-[#f8fafc] overflow-hidden text-slate-800 font-sans">
      <Sidebar
        currentView={route.view}
        navigateTo={navigateTo}
        globalDate={globalDate}
        setGlobalDate={setGlobalDate}
        mobileOpen={menuOpen}
        onClose={() => setMenuOpen(false)}
      />
      {/* Phone-sized screens: dark backdrop behind the open menu; tapping it closes the menu. */}
      {menuOpen && (
        <div className="fixed inset-0 bg-black/40 z-30 md:hidden" onClick={() => setMenuOpen(false)} aria-hidden="true" />
      )}
      <div className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
        {/* Phone-sized screens: top bar with the menu button. Hidden on larger screens, where the sidebar is always shown. */}
        <div className="md:hidden flex items-center gap-3 px-4 py-3 bg-[#0f172a] text-white shrink-0">
          <button
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
            aria-controls="app-sidebar"
            aria-expanded={menuOpen}
            className="p-1 -ml-1 rounded hover:bg-slate-800"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
          </button>
          <Logo size={22} className="shrink-0" />
          <div className="font-bold tracking-tight">Team Tracker</div>
        </div>
        {testData && (
          <div className="bg-emerald-50 border-b border-emerald-200 text-emerald-800 text-[13px] font-medium px-4 py-2">
            Test copy: this app is using a private copy of the data and logins on this computer. Changes made here never reach the real database or the website.
          </div>
        )}
        {/* The daily meeting reminder, from 15 minutes before it starts until it ends. */}
        <MeetingBanner currentView={route.view} navigateTo={navigateTo} />
        <main ref={mainRef} className="p-4 md:p-6 flex-1 overflow-auto bg-[#f8fafc]">
          {renderView()}
        </main>
        {/* A short note while changes are being saved, and once they are. */}
        <div role="status" aria-live="polite" className="fixed bottom-4 right-4 z-40 pointer-events-none">
          {!saveError && saveState !== 'idle' && (
            <div className="bg-white border border-slate-200 shadow-md rounded-full px-3 py-1.5 text-[12px] font-semibold text-slate-600 flex items-center gap-2">
              {saveState === 'saving'
                ? <><span className="w-2 h-2 rounded-full bg-amber-400" aria-hidden="true"></span>Saving…</>
                : <><span className="text-emerald-600" aria-hidden="true">✓</span>Saved</>}
            </div>
          )}
        </div>
        {/* Shown when a save fails. The change has already been undone on screen. */}
        {saveError && (
          <div
            role="alert"
            className="fixed bottom-4 right-4 left-4 sm:left-auto sm:max-w-md z-50 bg-white border border-red-200 border-l-4 border-l-red-500 rounded-lg shadow-lg p-4 flex items-start gap-3"
          >
            <div className="flex-1">
              <div className="font-bold text-red-700 text-sm">Not saved</div>
              <div className="text-slate-700 text-sm mt-1">{saveError}</div>
            </div>
            <button
              onClick={clearSaveError}
              aria-label="Close message"
              className="text-slate-400 hover:text-slate-700 text-lg leading-none px-1"
            >
              ×
            </button>
          </div>
        )}
      </div>
    </div>
    </MeetingsProvider>
  );
}
