'use client'

import { useMemo, useState } from 'react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { useMeetingClock } from '../hooks/useMeetingClock';
import { meetingSetup, meetingSettings, daysLabel, formatTimeRange, type MeetingSetup } from '../utils/meeting';
import { firstInformDay, inMeeting, isDailyNote, meetingGroups, type Absence } from '../utils/absences';
import { teamMemberForEmail } from '../utils/team';
import { formatDate } from '../utils/dates';
import { useAbsences, useAbsenceActions } from '../hooks/useAbsences';
import { MeetingCard, DaysOffCard, MeetingDetailsDialog } from './MeetingDetails';
import { CantAttendDialog, MeetingListCard, MyNotesCard, MonthlyNotesCard } from './MeetingPeople';
import { PageHeader } from './PageHeader';

// The Daily Meeting page: when and where the meeting is, the days with no meeting, telling the team you can't attend,
// and the list of who is in the meeting. (The day's updates, open issues and follow-ups are on the Dashboard.)
export function MeetingView({ globalDate, onBack }: { globalDate: string; onBack?: () => void }) {
  const { data, saveData } = useData();
  const { user, isAdmin } = useAuth();
  // The meeting's details (admins change them) and the time now, India time.
  const setup = useMemo(() => meetingSetup(data.settings), [data.settings]);
  const clock = useMeetingClock();
  const [editingDetails, setEditingDetails] = useState(false);
  const saveSetup = (next: MeetingSetup, details: string) => {
    saveData({ ...data, settings: { ...data.settings, ...meetingSettings(next) } }, 'MEETING_UPDATE', details);
  };

  // "I can't attend" notes. The signed-in person is matched to the team by email; admins can write anyone's.
  const me = useMemo(() => teamMemberForEmail(data.team, user?.email), [data.team, user?.email]);
  const members = useMemo(() => meetingGroups(data.team).flatMap((g) => g.members), [data.team]);
  const canInform = (!!me && inMeeting(me)) || (isAdmin && members.length > 0);
  const [notesVersion, setNotesVersion] = useState(0);
  const { absences: dayNotes, error: dayNotesError } = useAbsences(`date=${globalDate}`, notesVersion);
  // (Your notes and the monthly list come back for every meeting; this page is the daily meeting's.)
  const { absences: myAllNotes } = useAbsences(me ? 'mine=1' : null, notesVersion);
  const myNotes = myAllNotes && myAllNotes.filter(isDailyNote);
  const [month, setMonth] = useState(() => clock.date.slice(0, 7));
  const { absences: monthAllNotes, error: monthNotesError } = useAbsences(isAdmin ? `month=${month}` : null, notesVersion);
  const monthNotes = monthAllNotes && monthAllNotes.filter(isDailyNote);
  const { inform, withdraw } = useAbsenceActions();
  const [informing, setInforming] = useState(false);
  const sendNote = async (note: { from: string; to?: string; reason: string; memberId?: string }) => {
    const failed = await inform(note);
    if (!failed) setNotesVersion((v) => v + 1);
    return failed;
  };
  const takeBack = async (note: Absence) => {
    const failed = await withdraw(note.date, note.memberId !== me?.id ? note.memberId : undefined);
    if (!failed) setNotesVersion((v) => v + 1);
    return failed;
  };
  const myNoteForDay = me ? (dayNotes || []).find((n) => n.memberId === me.id && n.date === globalDate) || null : null;

  return (
    <div className="max-w-5xl mx-auto space-y-4 font-sans pb-8">
      {onBack && (
        <button type="button" onClick={onBack} className="text-[13px] font-semibold text-sky-600 hover:underline flex items-center gap-1">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"></polyline></svg>
          All meetings
        </button>
      )}
      <PageHeader title="Daily Meeting" subtitle={`${formatDate(globalDate, { weekday: true })} · ${daysLabel(setup.days)}, ${formatTimeRange(setup.start, setup.end)} (India time)`} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <MeetingCard
          setup={setup} day={globalDate} clock={clock} canEdit={isAdmin} onEdit={() => setEditingDetails(true)}
          canInform={canInform} myNote={myNoteForDay} onCantAttend={() => setInforming(true)} onTakeBack={takeBack}
        />
        <DaysOffCard setup={setup} today={clock.date} canEdit={isAdmin} onSave={saveSetup} />
      </div>
      <MeetingListCard setup={setup} day={globalDate} clock={clock} team={data.team} notes={dayNotes} error={dayNotesError} isAdmin={isAdmin} />
      <div className={`grid grid-cols-1 ${isAdmin ? 'lg:grid-cols-2' : ''} gap-4`}>
        <MyNotesCard me={me} scheduleFor={() => setup} clock={clock} notes={myNotes} isAdmin={isAdmin} onAdd={() => setInforming(true)} onWithdraw={takeBack} />
        {isAdmin && <MonthlyNotesCard month={month} onMonth={setMonth} team={data.team} notes={monthNotes} error={monthNotesError} />}
      </div>
      {editingDetails && <MeetingDetailsDialog setup={setup} onSave={saveSetup} onClose={() => setEditingDetails(false)} />}
      {informing && (
        <CantAttendDialog
          setup={setup} clock={clock} firstDay={firstInformDay(setup, globalDate, clock)} members={members}
          myId={me && inMeeting(me) ? me.id : null} isAdmin={isAdmin} onSend={sendNote} onClose={() => setInforming(false)}
        />
      )}
    </div>
  );
}
