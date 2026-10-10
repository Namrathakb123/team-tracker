'use client'

import { useState } from 'react';
import { useData } from '../context/DataContext';
import { badgeClass, dotClass, chosenColor, automaticColor, withItemColor, COLOR_NAMES, COLOR_LABELS, type ColorName } from '../utils/colors';
import { priorityDotClass, priorityBadgeClass } from '../utils/priorities';
import { DEFAULT_ITEM_KEYS, defaultItem } from '../utils/defaults';
import { tidyName, sameName } from '../utils/clients';
import { PageHeader } from './PageHeader';
import { PRIMARY_BUTTON, SECONDARY_BUTTON, DANGER_BUTTON, SMALL_BUTTON, LARGE_BUTTON, CARD, DIALOG, SECTION_TITLE, DIALOG_TITLE } from '../utils/styles';

export function CustomizeView() {
  const { data, saveData } = useData();
  const [newStatus, setNewStatus] = useState('');
  const [activeList, setActiveList] = useState('clientStatuses');

  const lists: Record<string, string> = {
    clientStatuses: 'Client Statuses',
    deliveryStatuses: 'Delivery Statuses',
    priorities: 'Task Priorities',
    issueStatuses: 'Task Statuses',
    leadStatuses: 'Lead Statuses',
    leadSources: 'Lead Sources'
  };

  // A new item is saved trimmed; a name the list already has (ignoring capitals and spaces) is refused.
  const addClash = tidyName(newStatus)
    ? (data.settings?.[activeList] || []).find((i: string) => sameName(i, newStatus)) || null
    : null;
  const handleAddItem = (e: React.FormEvent) => {
    e.preventDefault();
    const item = tidyName(newStatus);
    if (!item || addClash) return; // the form says why

    const currentList = data.settings?.[activeList] || [];
    saveData({
      ...data,
      settings: {
        ...(data.settings || {}),
        [activeList]: [...currentList, item]
      }
    }, 'SETTINGS_UPDATE', `Added "${item}" to ${lists[activeList]}`);
    setNewStatus('');
  };

  // Three lists have a tick box per item that changes how the app counts things.
  const FLAGS: Record<string, { key: string; label: string; accent: string; help: string }> = {
    priorities: {
      key: 'urgentPriorities', label: 'Urgent', accent: 'accent-red-500',
      help: 'Tasks with a priority ticked Urgent are counted in the Dashboard\u2019s \u201cUrgent tasks\u201d counter.',
    },
    issueStatuses: {
      key: 'closedIssueStatuses', label: 'Closed', accent: 'accent-emerald-600',
      help: 'Tasks with a status ticked Closed count as finished everywhere: open-task counts, the Dashboard, the Clients and Team pages, and the report.',
    },
    leadStatuses: {
      key: 'closedLeadStatuses', label: 'Closed', accent: 'accent-emerald-600',
      help: 'Leads with a status ticked Closed are finished: they are left out of the follow-ups due on the Lead Followups page and the Dashboard.',
    },
    clientStatuses: {
      key: 'activeClientStatuses', label: 'Active', accent: 'accent-sky-500',
      help: 'Clients with a status ticked Active are counted in the Dashboard\u2019s \u201cActive clients\u201d counter.',
    },
  };
  const flag = FLAGS[activeList];
  const flagged: string[] = flag ? (data.settings?.[flag.key] || []) : [];

  const toggleFlag = (item: string) => {
    if (!flag) return;
    const isOn = flagged.includes(item);
    saveData({
      ...data,
      settings: {
        ...data.settings,
        [flag.key]: isOn ? flagged.filter(p => p !== item) : [...flagged, item]
      }
    }, 'SETTINGS_UPDATE', `${isOn ? 'Unticked' : 'Ticked'} "${flag.label}" for "${item}" in ${lists[activeList]}`);
  };

  // The item new records get from this list (see DEFAULT_ITEM_KEYS).
  const defaultKey = DEFAULT_ITEM_KEYS[activeList];
  const currentDefault = defaultKey ? defaultItem(data.settings, activeList) : '';
  const DEFAULT_HELP: Record<string, string> = {
    clientStatuses: 'New clients start with the status marked Default.',
    deliveryStatuses: 'New clients start with the delivery status marked Default.',
    issueStatuses: 'New tasks start with the status marked Default.',
    leadStatuses: 'New leads start with the status marked Default.',
    priorities: 'New tasks start with the priority marked Default.',
  };
  const setDefault = (item: string) => {
    if (!defaultKey || item === currentDefault) return;
    saveData({
      ...data,
      settings: { ...data.settings, [defaultKey]: [item] }
    }, 'SETTINGS_UPDATE', `Made "${item}" the default in ${lists[activeList]}`);
  };

  // Each item's colour follows its meaning unless one is picked here (saved in settings.itemColors).
  const hasColors = activeList !== 'leadSources'; // sources aren't shown as coloured badges anywhere
  const setColor = (item: string, value: string) => {
    const color = (COLOR_NAMES as string[]).includes(value) ? (value as ColorName) : null;
    saveData({
      ...data,
      settings: { ...data.settings, itemColors: withItemColor(data.settings, activeList, item, color) }
    }, 'SETTINGS_UPDATE', color
      ? `Set the colour of "${item}" in ${lists[activeList]} to ${COLOR_LABELS[color]}`
      : `Set the colour of "${item}" in ${lists[activeList]} back to automatic`);
  };

  // Deleting an item: a window says which records use it and asks what to replace it with, so no record is left
  // holding a value that isn't in the list.
  const NOT_SET = '__not_set__';
  const [deleting, setDeleting] = useState<string | null>(null);
  const [replacement, setReplacement] = useState('');
  const USES: Record<string, { section: string; field: string; one: string; many: string }[]> = {
    clientStatuses: [{ section: 'clients', field: 'status', one: 'client', many: 'clients' }],
    deliveryStatuses: [{ section: 'clients', field: 'deliveryStatus', one: 'client', many: 'clients' }],
    issueStatuses: [{ section: 'issues', field: 'status', one: 'task', many: 'tasks' }],
    priorities: [{ section: 'issues', field: 'priority', one: 'task', many: 'tasks' }, { section: 'leads', field: 'priority', one: 'lead', many: 'leads' }],
    leadStatuses: [{ section: 'leads', field: 'status', one: 'lead', many: 'leads' }],
    leadSources: [{ section: 'leads', field: 'source', one: 'lead', many: 'leads' }],
  };
  const usesOf = (item: string) => (USES[activeList] || [])
    .map(u => ({ ...u, count: ((data as any)[u.section] || []).filter((r: any) => r && r[u.field] === item).length }))
    .filter(u => u.count > 0);
  const describeUses = (uses: ReturnType<typeof usesOf>) => uses.map(u => `${u.count} ${u.count === 1 ? u.one : u.many}`).join(' and ');

  const handleDeleteItem = (itemToRemove: string) => {
    setDeleting(itemToRemove);
    setReplacement('');
  };

  // Renaming an item: everything that uses the old name changes with it.
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');
  const startRename = (item: string) => {
    setRenaming(item);
    setRenameText(item);
  };
  const renameClash = renaming !== null && tidyName(renameText)
    ? (data.settings?.[activeList] || []).find((i: string) => i !== renaming && sameName(i, renameText)) || null
    : null;
  const saveRename = (e: React.FormEvent) => {
    e.preventDefault();
    const from = renaming;
    const to = tidyName(renameText);
    if (from === null || !to || renameClash) return; // the row says why
    if (to === from) {
      setRenaming(null);
      return;
    }
    const uses = usesOf(from);
    const next: any = { ...data };
    for (const u of uses) {
      next[u.section] = ((data as any)[u.section] || []).map((r: any) => r && r[u.field] === from ? { ...r, [u.field]: to } : r);
    }
    // A lead's history keeps its statuses by name too.
    if (activeList === 'leadStatuses') {
      next.leads = (next.leads || []).map((l: any) => l && Array.isArray(l.history) && l.history.some((h: any) => h && h.status === from)
        ? { ...l, history: l.history.map((h: any) => h && h.status === from ? { ...h, status: to } : h) }
        : l);
    }
    const swap = (arr: any) => Array.isArray(arr) ? arr.map((x: any) => x === from ? to : x) : arr;
    const settings: any = { ...data.settings, [activeList]: swap(data.settings?.[activeList] || []) };
    if (flag) settings[flag.key] = swap(data.settings?.[flag.key] || []);
    if (defaultKey && Array.isArray(data.settings?.[defaultKey])) settings[defaultKey] = swap(data.settings[defaultKey]);
    const color = chosenColor(data.settings, activeList, from);
    if (color) settings.itemColors = withItemColor({ itemColors: withItemColor(data.settings, activeList, from, null) }, activeList, to, color);
    saveData({ ...next, settings }, 'SETTINGS_UPDATE',
      `Renamed "${from}" to "${to}" in ${lists[activeList]}${uses.length ? `; its ${describeUses(uses)} changed too` : ''}`);
    setRenaming(null);
  };

  // Reordering: drag a row, or use the arrows. The order is used in dropdowns and when sorting.
  const [dragItem, setDragItem] = useState<string | null>(null);
  const moveItem = (item: string, toIndex: number) => {
    const list: string[] = [...(data.settings?.[activeList] || [])];
    const from = list.indexOf(item);
    if (from === -1 || toIndex < 0 || toIndex >= list.length || toIndex === from) return;
    list.splice(from, 1);
    list.splice(toIndex, 0, item);
    saveData({ ...data, settings: { ...data.settings, [activeList]: list } }, 'SETTINGS_UPDATE',
      `Moved "${item}" to position ${toIndex + 1} in ${lists[activeList]}`);
  };

  const confirmDelete = (e: React.FormEvent) => {
    e.preventDefault();
    const itemToRemove = deleting;
    if (itemToRemove === null) return;
    if ((data.settings?.[activeList] || []).length <= 1) return; // a list keeps at least one item
    const uses = usesOf(itemToRemove);
    if (uses.length > 0 && !replacement) return; // the window asks for a choice
    const to = replacement === NOT_SET ? '' : replacement;
    const next: any = { ...data };
    for (const u of uses) {
      next[u.section] = ((data as any)[u.section] || []).map((r: any) => r && r[u.field] === itemToRemove ? { ...r, [u.field]: to } : r);
    }
    const count = uses.reduce((n, u) => n + u.count, 0);
    const details = uses.length
      ? `Deleted "${itemToRemove}" from ${lists[activeList]}; its ${describeUses(uses)} now ${count === 1 ? 'uses' : 'use'} "${to || 'Not set'}"`
      : `Deleted "${itemToRemove}" from ${lists[activeList]}`;
    const currentList = data.settings?.[activeList] || [];
    saveData({
      ...next,
      settings: {
        ...data.settings,
        [activeList]: currentList.filter((i: string) => i !== itemToRemove),
        // A deleted item can't stay ticked, or stay the default (the first item becomes the default).
        ...(flag ? { [flag.key]: flagged.filter(p => p !== itemToRemove) } : {}),
        ...(defaultKey && (data.settings?.[defaultKey] || []).includes(itemToRemove) ? { [defaultKey]: [] } : {}),
        // Nor keep a picked colour.
        ...(chosenColor(data.settings, activeList, itemToRemove) ? { itemColors: withItemColor(data.settings, activeList, itemToRemove, null) } : {})
      }
    }, 'SETTINGS_UPDATE', details);
    setDeleting(null);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <PageHeader title="System Customization" subtitle="Configure global dropdowns, statuses, and workflow pipelines." />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
        <div className="md:col-span-1 space-y-1">
          {Object.entries(lists).map(([key, label]) => (
            <button
              key={key}
              onClick={() => { setActiveList(key); setRenaming(null); }}
              className={`w-full text-left px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                activeList === key 
                  ? 'bg-sky-50 text-sky-700 shadow-sm border border-sky-100' 
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="md:col-span-3">
          <div className={`${CARD} overflow-hidden`}>
            <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50">
              <h3 className={SECTION_TITLE}>{lists[activeList]}</h3>
            </div>
            
            <div className="p-6">
              <form onSubmit={handleAddItem} className="flex flex-wrap gap-4 mb-6">
                <input aria-label={`Add to ${lists[activeList]}`} 
                  type="text" 
                  placeholder={`Add new ${lists[activeList].toLowerCase()}...`}
                  value={newStatus} 
                  onChange={e => setNewStatus(e.target.value)} 
                  required 
                  className="flex-1 border border-slate-200 p-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-all bg-slate-50"
                />
                <button type="submit" disabled={!!addClash} className={`${PRIMARY_BUTTON} ${LARGE_BUTTON}`}>
                  Add Item
                </button>
                {addClash && <p role="alert" className="basis-full -mt-2 text-xs text-red-600">“{addClash}” is already in this list.</p>}
              </form>

              <div className="space-y-2">
                {(!data.settings?.[activeList] || data.settings[activeList].length === 0) ? (
                  <div className="text-center p-6 text-slate-400 text-sm border border-dashed border-slate-200 rounded-lg">No items configured.</div>
                ) : (
                  data.settings[activeList].map((item: string, idx: number) => {
                    // Colours follow each item's meaning (Critical red, Resolved green), or the colour picked here.
                    const badgeColor = activeList === 'priorities' ? priorityBadgeClass(item, data.settings) : badgeClass(data.settings, activeList, item);
                    const dotColor = activeList === 'priorities' ? priorityDotClass(item, data.settings) : dotClass(data.settings, activeList, item);
                    const isDotStyle = activeList === 'deliveryStatuses' || activeList === 'priorities';

                    const isRenaming = renaming === item;
                    const lastIndex = data.settings[activeList].length - 1;

                    return (
                      <div
                        key={item}
                        draggable={!isRenaming}
                        onDragStart={e => { setDragItem(item); e.dataTransfer.effectAllowed = 'move'; }}
                        onDragOver={e => { if (dragItem !== null) e.preventDefault(); }}
                        onDrop={e => { e.preventDefault(); if (dragItem !== null) moveItem(dragItem, idx); setDragItem(null); }}
                        onDragEnd={() => setDragItem(null)}
                        className={`flex flex-wrap justify-between items-center gap-3 p-3 rounded-lg border border-slate-100 bg-white hover:bg-slate-50 hover:border-slate-200 transition-colors shadow-sm ${dragItem === item ? 'opacity-50' : ''}`}
                      >
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="cursor-grab text-slate-300 select-none text-sm" title="Drag to change the order" aria-hidden="true">⋮⋮</span>
                          <div className="flex flex-col">
                            <button type="button" onClick={() => moveItem(item, idx - 1)} disabled={idx === 0} aria-label={`Move ${item} up`} title="Move up" className="text-slate-400 hover:text-slate-700 disabled:opacity-20 disabled:cursor-default text-[10px] leading-none px-1">▲</button>
                            <button type="button" onClick={() => moveItem(item, idx + 1)} disabled={idx === lastIndex} aria-label={`Move ${item} down`} title="Move down" className="text-slate-400 hover:text-slate-700 disabled:opacity-20 disabled:cursor-default text-[10px] leading-none px-1">▼</button>
                          </div>
                        {isRenaming ? (
                          <form onSubmit={saveRename} onKeyDown={e => { if (e.key === 'Escape') setRenaming(null); }} className="flex flex-wrap items-center gap-2">
                            <input
                              autoFocus
                              aria-label={`New name for ${item}`}
                              value={renameText}
                              onChange={e => setRenameText(e.target.value)}
                              className="border border-slate-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:border-sky-500 bg-white"
                            />
                            <button type="submit" disabled={!renameText.trim() || !!renameClash} className={`${PRIMARY_BUTTON} ${SMALL_BUTTON}`}>Save</button>
                            <button type="button" onClick={() => setRenaming(null)} className={`${SECONDARY_BUTTON} ${SMALL_BUTTON}`}>Cancel</button>
                            {renameClash && <p role="alert" className="basis-full text-xs text-red-600">“{renameClash}” is already in this list.</p>}
                          </form>
                        ) : isDotStyle ? (
                          <div className="inline-flex items-center gap-2">
                             <div className={`w-2.5 h-2.5 rounded-full ${dotColor}`}></div>
                             <span className="font-medium text-slate-700 whitespace-nowrap">{item}</span>
                          </div>
                        ) : (
                          <div className={`inline-flex items-center border rounded-full px-4 py-1.5 transition-colors ${badgeColor} bg-white/50 shadow-sm`}>
                             <span className="font-bold text-sm whitespace-nowrap">{item}</span>
                          </div>
                        )}
                        </div>
                        <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2 ml-auto">
                          {hasColors && (
                            <select
                              aria-label={`Colour for ${item}`}
                              value={chosenColor(data.settings, activeList, item) || ''}
                              onChange={e => setColor(item, e.target.value)}
                              className="w-36 text-xs border border-slate-200 rounded-lg px-1.5 py-1 bg-white text-slate-600 cursor-pointer"
                            >
                              <option value="">Automatic ({COLOR_LABELS[automaticColor(data.settings, activeList, item)]})</option>
                              {COLOR_NAMES.map(c => <option key={c} value={c}>{COLOR_LABELS[c]}</option>)}
                            </select>
                          )}
                          {defaultKey && (
                            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600 cursor-pointer select-none">
                              <input
                                type="radio"
                                name={`default-${activeList}`}
                                checked={item === currentDefault}
                                onChange={() => setDefault(item)}
                                className="accent-slate-700 cursor-pointer"
                              />
                              Default
                            </label>
                          )}
                          {flag && (
                            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600 cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={flagged.includes(item)}
                                onChange={() => toggleFlag(item)}
                                className={`${flag.accent} cursor-pointer`}
                              />
                              {flag.label}
                            </label>
                          )}
                          <button
                            onClick={() => startRename(item)}
                            className="text-slate-400 hover:text-sky-600 font-medium text-xs transition-colors"
                          >
                            Rename
                          </button>
                          <button
                            onClick={() => handleDeleteItem(item)}
                            disabled={lastIndex === 0}
                            title={lastIndex === 0 ? 'A list needs at least one item' : undefined}
                            className="text-slate-400 hover:text-red-500 font-medium text-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-slate-400"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
          
          {(data.settings?.[activeList] || []).length === 1 && (
            <p className="text-xs text-amber-700 mt-4 px-2">This list has one item left. A list needs at least one, so it can&apos;t be deleted (it can be renamed).</p>
          )}
          {defaultKey && (
            <p className="text-xs text-slate-500 mt-4 px-2">{DEFAULT_HELP[activeList]}</p>
          )}
          {hasColors && (
            <p className="text-xs text-slate-500 mt-2 px-2">Colours follow each item&apos;s meaning (for example Resolved is green and Blocked is red) unless you pick one.</p>
          )}
          {flag && (
            <p className="text-xs text-slate-500 mt-2 px-2">{flag.help}</p>
          )}
          <p className="text-xs text-slate-400 mt-4 px-2">
            Drag items by ⋮⋮ (or use the arrows) to change the order used in dropdowns and when sorting. Renaming an item
            renames it everywhere it is used. Deleting an item that clients, tasks or leads use asks what to change them to.
          </p>
        </div>
      </div>

      {deleting !== null && (() => {
        const uses = usesOf(deleting);
        const others: string[] = (data.settings?.[activeList] || []).filter((i: string) => i !== deleting);
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm"
            onClick={e => { if (e.target === e.currentTarget) setDeleting(null); }}
            onKeyDown={e => { if (e.key === 'Escape') setDeleting(null); }}
          >
            <div role="dialog" aria-modal="true" aria-label="Delete item" className={`${DIALOG} w-full max-w-md overflow-hidden`}>
              <div className="bg-slate-50 px-5 py-4 border-b border-slate-200">
                <h3 className={DIALOG_TITLE}>Delete “{deleting}” from {lists[activeList]}?</h3>
              </div>
              <form onSubmit={confirmDelete} className="p-4 space-y-4">
                {uses.length > 0 ? (
                  <>
                    <p className="text-[13px] text-slate-700">It is used by {describeUses(uses)}.</p>
                    <label className="block">
                      <span className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Change them to</span>
                      <select autoFocus required value={replacement} onChange={e => setReplacement(e.target.value)} className="w-full border border-slate-200 rounded-lg p-2.5 text-[13px] focus:outline-none focus:border-sky-500 bg-white text-slate-800 font-medium">
                        <option value="" disabled>Choose…</option>
                        {others.map(i => <option key={i} value={i}>{i}</option>)}
                        {activeList === 'leadSources' && <option value={NOT_SET}>Not set</option>}
                      </select>
                    </label>
                  </>
                ) : (
                  <p className="text-[13px] text-slate-700">Nothing uses it.</p>
                )}
                <div className="pt-2 flex gap-3">
                  <button type="button" onClick={() => setDeleting(null)} className={`flex-1 ${SECONDARY_BUTTON} py-2.5 text-[13px]`}>Cancel</button>
                  <button type="submit" autoFocus={uses.length === 0} disabled={uses.length > 0 && !replacement} className={`flex-1 ${DANGER_BUTTON} py-2.5 text-[13px]`}>Delete</button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
