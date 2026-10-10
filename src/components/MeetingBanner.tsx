'use client'

// The meeting reminder at the top of every page: from 15 minutes before one of your meetings until it ends. The
// daily team meeting reminds everyone; another meeting reminds the people in it and the admin who added it. Not shown
// on the Meetings pages. Each meeting's reminder can be hidden for the day.
import { useMemo, useState } from 'react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { useMeetings } from '../context/MeetingsContext';
import { useMeetingClock } from '../hooks/useMeetingClock';
import { teamMemberForEmail } from '../utils/team';
import { durationLabel, formatClock, formatTimeRange, isGoogleMeet } from '../utils/meeting';
import { dailyMeeting, isMyMeeting, meetingReminders } from '../utils/meetings';

// The reminders hidden in this browser, as "YYYY-MM-DD|meeting id" (only today's are kept).
const HIDDEN_KEY = 'meeting-reminder-hidden';

function readHidden(): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(HIDDEN_KEY) || '[]');
    return Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function MeetingBanner({ currentView, navigateTo }: { currentView: string; navigateTo: (view: string, params?: Record<string, string>) => void }) {
  const { data } = useData();
  const { user } = useAuth();
  const { meetings } = useMeetings();
  const clock = useMeetingClock();
  const [hidden, setHidden] = useState<string[]>(readHidden);
  const me = useMemo(() => teamMemberForEmail(data.team, user?.email), [data.team, user?.email]);
  const mine = useMemo(
    () => [dailyMeeting(data.settings), ...(meetings || []).filter((m) => isMyMeeting(m, data.team, me, user?.email))],
    [data.settings, data.team, meetings, me, user?.email],
  );
  const reminders = meetingReminders(mine, clock).filter((r) => !hidden.includes(`${clock.date}|${r.meeting.id}`));
  if (!reminders.length || currentView === 'meeting') return null;

  const { meeting, status } = reminders[0];
  const hide = () => {
    const next = [...hidden.filter((key) => key.startsWith(`${clock.date}|`)), `${clock.date}|${meeting.id}`];
    try { localStorage.setItem(HIDDEN_KEY, JSON.stringify(next)); } catch { /* hidden until the page reloads */ }
    setHidden(next);
  };
  const live = status.kind === 'live';
  const name = meeting.builtIn ? 'The daily meeting' : `“${meeting.title}”`;
  const more = reminders.length - 1;

  return (
    <div className="bg-sky-50 border-b border-sky-200 text-sky-900 text-[13px] font-medium px-4 py-2 flex flex-wrap items-center gap-x-4 gap-y-1">
      <span className="flex items-center gap-2 min-w-0">
        <span className={`w-2 h-2 rounded-full shrink-0 ${live ? 'bg-red-500 motion-safe:animate-pulse' : 'bg-sky-500'}`} aria-hidden="true"></span>
        <span>
          {live
            ? `${name} is on now, until ${formatClock(meeting.end)}.`
            : `${name} starts in ${durationLabel(status.minutes)} (${formatTimeRange(meeting.start, meeting.end)}).`}
          {more > 0 && <span className="text-sky-700"> {more === 1 ? '1 more meeting is' : `${more} more meetings are`} about to start or on.</span>}
        </span>
      </span>
      <span className="flex items-center gap-4 ml-auto">
        {meeting.link && (
          <a href={meeting.link} target="_blank" rel="noopener noreferrer" className="font-bold text-sky-700 hover:underline">
            {isGoogleMeet(meeting.link) ? 'Join Google Meet' : 'Join meeting'}
          </a>
        )}
        <button type="button" onClick={() => navigateTo('meeting', { selectedMeetingId: meeting.id })} className="font-bold text-sky-700 hover:underline">Meeting details</button>
        <button type="button" onClick={hide} aria-label="Hide the meeting reminder for today" className="text-sky-700/70 hover:text-sky-900 text-lg leading-none px-1">×</button>
      </span>
    </div>
  );
}
