'use client'

import { useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Logo } from './Logo';
import { ChangePasswordDialog } from './PasswordForms';
import { ACCESS_LABELS } from '../utils/accounts';
import { localDateKey, addDays, formatDate } from '../utils/dates';

const icons = {
  dashboard: <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>,
  meeting: <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>,
  issues: <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4"></path><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>,
  clients: <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>,
  leads: <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg>,
  team: <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>,
  customize: <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>,
  work: <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path></svg>,
  audit: <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
};

export function Sidebar({
  currentView,
  navigateTo,
  globalDate,
  setGlobalDate,
  mobileOpen = false,
  onClose
}: {
  currentView: string;
  navigateTo: (view: string, params?: any) => void;
  globalDate: string;
  setGlobalDate: (d: string) => void;
  // On small screens the sidebar is hidden until the menu button opens it.
  mobileOpen?: boolean;
  onClose?: () => void;
}) {
  const { user, role, isAdmin, logout, changePassword } = useAuth();
  const dateInputRef = useRef<HTMLInputElement>(null);
  const [changingPassword, setChangingPassword] = useState(false);

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: icons.dashboard },
    { id: 'work', label: 'My work', icon: icons.work },
    { id: 'meeting', label: 'Meetings', icon: icons.meeting },
    { id: 'issues', label: 'Tasks', icon: icons.issues },
    { id: 'clients', label: 'Clients', icon: icons.clients },
    { id: 'leads', label: 'Lead Followups', icon: icons.leads },
    { id: 'team', label: 'Team', icon: icons.team },
    // Only admins can change settings, so the page is not shown to anyone else.
    ...(isAdmin ? [{ id: 'customize', label: 'Customize', icon: icons.customize }] : []),
  ];

  const todayStr = localDateKey();
  const isToday = globalDate === todayStr;

  const moveDate = (days: number) => {
    setGlobalDate(addDays(globalDate, days));
  };

  const formattedDate = formatDate(globalDate);

  return (
    <aside
      id="app-sidebar"
      className={`w-64 bg-[#1e293b] text-slate-300 flex flex-col h-full shrink-0 shadow-xl fixed inset-y-0 left-0 z-40 transition-transform duration-200 md:static md:z-20 md:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}
    >
      <div className="p-4 border-b border-slate-700/50 bg-[#0f172a] flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
          <Logo size={28} className="shrink-0" />
          Team Tracker
        </h1>
        <button
          onClick={onClose}
          aria-label="Close menu"
          className="md:hidden text-slate-400 hover:text-white text-2xl leading-none px-1"
        >
          ×
        </button>
      </div>
      
      <nav className="flex-1 overflow-y-auto py-3 flex flex-col justify-between">
        <ul className="space-y-1 px-3">
          {navItems.map(item => (
            <li key={item.id}>
              <button
                onClick={() => navigateTo(item.id)}
                className={`w-full text-left px-3 py-2 flex items-center space-x-3 transition-all rounded-lg text-sm font-medium ${
                  currentView === item.id 
                    ? 'bg-sky-500/10 text-sky-400' 
                    : 'hover:bg-slate-800 hover:text-white'
                }`}
              >
                <span className={`${currentView === item.id ? 'opacity-100 text-sky-400' : 'opacity-50'}`}>{item.icon}</span>
                <span>{item.label}</span>
              </button>
            </li>
          ))}
          
          {isAdmin && (
            <div className="pt-4 mt-4 border-t border-slate-700/50 space-y-1">
              <div className="px-3 pb-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">Administration</div>
              <li>
                <button
                  onClick={() => navigateTo('audit')}
                  className={`w-full text-left px-3 py-2 flex items-center space-x-3 transition-all rounded-lg text-sm font-medium ${
                    currentView === 'audit' 
                      ? 'bg-sky-500/10 text-sky-400' 
                      : 'hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <span className={`${currentView === 'audit' ? 'opacity-100 text-sky-400' : 'opacity-50'}`}>{icons.audit}</span>
                  <span>Audit Logs</span>
                </button>
              </li>
            </div>
          )}
        </ul>

        {/* Global Date & User Profile */}
        <div className="px-3 mt-4 pt-4 border-t border-slate-700/50">
          <div className="mb-3 bg-slate-800/50 p-2.5 rounded-lg border border-slate-700/50">
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Dashboard Date</label>
            <div className="flex items-center justify-between bg-slate-900 border border-slate-700 rounded-lg overflow-hidden">
              <button 
                onClick={() => moveDate(-1)}
                className="p-2.5 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                title="Previous Day"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
              </button>
              
              <div 
                className="flex-1 text-center text-xs font-semibold text-slate-200 cursor-pointer flex items-center justify-center gap-2 py-2 hover:bg-slate-800 transition-colors relative"
                onClick={() => dateInputRef.current?.showPicker()}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-sky-400"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                {isToday ? 'Today' : formattedDate}
                <input aria-label="Dashboard date" 
                  ref={dateInputRef}
                  type="date" 
                  value={globalDate} 
                  onChange={(e) => setGlobalDate(e.target.value)}
                  className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                  style={{ colorScheme: 'dark' }}
                />
              </div>

              <button 
                onClick={() => !isToday && moveDate(1)}
                disabled={isToday}
                className={`p-2.5 transition-colors ${isToday ? 'text-slate-700 cursor-not-allowed' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
                title={isToday ? "Cannot go past today" : "Next Day"}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
              </button>
            </div>
          </div>

          <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-700/50">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Session</p>
            <p className="font-semibold text-white truncate text-sm mb-2" title={user?.email || ''}>{user?.email}</p>
            <div className="inline-flex items-center px-2 py-1 rounded bg-sky-500/20 text-sky-400 text-xs font-semibold mb-3">
              Access: <span className="ml-1">{role ? ACCESS_LABELS[role] : 'None'}</span>
            </div>

            <button
              onClick={() => setChangingPassword(true)}
              className="w-full mb-2 flex items-center justify-center gap-2 bg-slate-700/50 text-slate-300 font-medium text-sm py-1.5 rounded-lg hover:bg-slate-700 hover:text-white transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
              Change password
            </button>
            <button
              onClick={logout}
              className="w-full flex items-center justify-center gap-2 bg-slate-700/50 text-slate-300 font-medium text-sm py-1.5 rounded-lg hover:bg-red-500/10 hover:text-red-400 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
              Sign Out
            </button>
          </div>
        </div>
      </nav>
      {changingPassword && <ChangePasswordDialog onSave={changePassword} onClose={() => setChangingPassword(false)} />}
    </aside>
  );
}
