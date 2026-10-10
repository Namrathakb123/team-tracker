'use client'

import { useEffect, useState } from 'react';
import { meetingClock, type MeetingClock } from '../utils/meeting';

// The day and time now (India time), checked every 20 seconds so the meeting status and reminder stay current.
export function useMeetingClock(): MeetingClock {
  const [clock, setClock] = useState<MeetingClock>(() => meetingClock());
  useEffect(() => {
    const timer = setInterval(() => {
      const next = meetingClock();
      setClock((prev) => (prev.date === next.date && prev.minutes === next.minutes ? prev : next));
    }, 20000);
    return () => clearInterval(timer);
  }, []);
  return clock;
}
