'use client'

import { useEffect, useState } from 'react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { useConfirm } from '../components/ConfirmDialog';

// Editing, deleting (with Undo) and restoring daily updates. The Dashboard feed and a client's page both use this,
// so they follow the same rules (utils/updates.ts says who may do what; the server checks it too).
export function useUpdateEditing() {
  const { data, saveData } = useData();
  const { user } = useAuth();
  const confirm = useConfirm();

  const clientNameOf = (id: string | null | undefined) => data.clients?.find((c: any) => c.id === id)?.name || 'an unknown client';

  // Deleting hides an update but keeps it, so it can be restored: right away with Undo, or later by an admin.
  const [recentlyDeleted, setRecentlyDeleted] = useState<string | null>(null);
  useEffect(() => {
    if (!recentlyDeleted) return;
    const timer = setTimeout(() => setRecentlyDeleted(null), 15000);
    return () => clearTimeout(timer);
  }, [recentlyDeleted]);

  const handleDeleteUpdate = async (u: any) => {
    const ok = await confirm({
      title: 'Delete this update?',
      message: 'You can undo it for a few seconds afterwards, and an admin can restore it later.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    const saved = await saveData({
      ...data,
      updates: (data.updates || []).map((x: any) => x.id === u.id ? { ...x, deletedAt: new Date().toISOString(), deletedBy: user?.email || null } : x)
    }, 'UPDATE_DELETE', `Deleted an update for ${clientNameOf(u.clientId)}`);
    if (saved) setRecentlyDeleted(u.id);
  };

  const handleRestoreUpdate = (id: string) => {
    const u = (data.updates || []).find((x: any) => x.id === id);
    if (!u) return;
    const restored = { ...u };
    delete restored.deletedAt;
    delete restored.deletedBy;
    saveData({
      ...data,
      updates: (data.updates || []).map((x: any) => x.id === id ? restored : x)
    }, 'UPDATE_RESTORE', `Restored an update for ${clientNameOf(u.clientId)}`);
    setRecentlyDeleted(null);
  };

  // Editing an update's text (only the person who wrote it).
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const startEdit = (u: any) => {
    setEditingId(u.id);
    setEditText(u.text || '');
  };
  const saveEdit = (u: any) => {
    const text = editText.trim();
    if (!text) return;
    if (text !== (u.text || '').trim()) {
      saveData({
        ...data,
        updates: (data.updates || []).map((x: any) => x.id === u.id ? { ...x, text, editedAt: new Date().toISOString() } : x)
      }, 'UPDATE_EDIT', `Edited an update for ${clientNameOf(u.clientId)}`);
    }
    setEditingId(null);
  };

  return {
    recentlyDeleted, handleDeleteUpdate, handleRestoreUpdate,
    editingId, setEditingId, editText, setEditText, startEdit, saveEdit,
  };
}
