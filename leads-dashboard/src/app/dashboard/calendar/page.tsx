'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, CalendarDays, PartyPopper } from 'lucide-react';
import { getEvents, getEffectiveEventStatus, formatEventDateRange, getEventSortTime, EventItem } from '@/lib/local-data';
import { canViewEvent, canApprovePendingEvent } from '@/lib/permissions';

export default function CalendarPage() {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [user, setUser] = useState<any>(null);
  const [calendarDate, setCalendarDate] = useState(new Date(2026, 7, 1)); // Default August 2026
  const [selectedDay, setSelectedDay] = useState<number | null>(10); // Default to 10th

  useEffect(() => {
    const refreshData = () => {
      setEvents(getEvents());
    };
    refreshData();

    const savedUser = localStorage.getItem('user');
    if (savedUser) {
      try {
        setUser(JSON.parse(savedUser));
      } catch (e) {
        console.error(e);
      }
    }

    window.addEventListener('leads-data-sync', refreshData);
    window.addEventListener('storage', refreshData);
    return () => {
      window.removeEventListener('leads-data-sync', refreshData);
      window.removeEventListener('storage', refreshData);
    };
  }, []);

  // Same visibility rule as the Events page: approved/legacy events follow the
  // own-vs-all Group Policy scope; pending/rejected submissions are only shown to
  // their submitter, their resolved approver, or the Super User.
  const visibleEvents = events.filter(event => {
    if (event.approvalStatus === 'pending_create' || event.approvalStatus === 'rejected') {
      return user?.tier === 1 || event.submittedByEmail === user?.email || canApprovePendingEvent(event, user);
    }
    return canViewEvent(event, user);
  });

  const handlePrevMonth = () => {
    const newDate = new Date(calendarDate.getFullYear(), calendarDate.getMonth() - 1, 1);
    setCalendarDate(newDate);
    const maxDays = new Date(newDate.getFullYear(), newDate.getMonth() + 1, 0).getDate();
    setSelectedDay(prev => prev ? Math.min(prev, maxDays) : 1);
  };

  const handleNextMonth = () => {
    const newDate = new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 1);
    setCalendarDate(newDate);
    const maxDays = new Date(newDate.getFullYear(), newDate.getMonth() + 1, 0).getDate();
    setSelectedDay(prev => prev ? Math.min(prev, maxDays) : 1);
  };

  const calYear = calendarDate.getFullYear();
  const calMonth = calendarDate.getMonth();

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const firstDayIndex = new Date(calYear, calMonth, 1).getDay();

  const calendarDays: (number | null)[] = [];
  for (let i = 0; i < firstDayIndex; i++) {
    calendarDays.push(null);
  }
  for (let i = 1; i <= daysInMonth; i++) {
    calendarDays.push(i);
  }

  const getDayEvents = (day: number) => {
    const checkStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    // A "dates to be decided" event has no real date to place on the grid —
    // it still shows up in the Upcoming Events list below instead.
    return visibleEvents.filter(e => !e.datesTBD && checkStr >= e.startDate && checkStr <= e.endDate);
  };

  const upcomingEvents = [...visibleEvents]
    .filter(e => !e.isHoliday)
    .filter(e => {
      const effective = getEffectiveEventStatus(e);
      return effective !== 'completed' && effective !== 'archived';
    })
    .sort((a, b) => getEventSortTime(a) - getEventSortTime(b))
    .slice(0, 6);

  const todayStr = new Date().toISOString().slice(0, 10);
  const upcomingHolidays = [...visibleEvents]
    .filter(e => e.isHoliday && e.startDate >= todayStr)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .slice(0, 6);

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-theme-text-primary flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-accent" />
          Calendar
        </h1>
        <p className="text-xs text-theme-text-secondary">Explore scheduled symposiums, workshops, and milestones across the organization</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Interactive Event Calendar */}
        <div className="lg:col-span-2 glass-panel rounded-2xl p-6 flex flex-col space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-theme-text-primary">LEADS Event Calendar</h3>
              <p className="text-xs text-theme-text-secondary">Click a highlighted day to see what's scheduled</p>
            </div>

            <div className="flex items-center gap-1 bg-theme-background/30 border border-theme-border/30 rounded-xl p-1 text-xs">
              <button
                onClick={handlePrevMonth}
                className="p-1 hover:bg-theme-border/30 rounded-lg text-theme-text-secondary hover:text-theme-text-primary transition-all cursor-pointer"
                title="Previous Month"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="px-2 font-semibold text-theme-text-primary select-none w-28 text-center text-xs">
                {monthNames[calMonth]} {calYear}
              </span>
              <button
                onClick={handleNextMonth}
                className="p-1 hover:bg-theme-border/30 rounded-lg text-theme-text-secondary hover:text-theme-text-primary transition-all cursor-pointer"
                title="Next Month"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Calendar Grid */}
          <div className="border border-theme-border/30 rounded-2xl p-4 bg-theme-background/10">
            <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-theme-text-secondary uppercase tracking-wider mb-2">
              <span>Su</span>
              <span>Mo</span>
              <span>Tu</span>
              <span>We</span>
              <span>Th</span>
              <span>Fr</span>
              <span>Sa</span>
            </div>

            <div className="grid grid-cols-7 gap-1.5">
              {calendarDays.map((day, idx) => {
                if (day === null) {
                  return <div key={`empty-${idx}`} className="aspect-square"></div>;
                }

                const dayEvents = getDayEvents(day);
                const hasEvents = dayEvents.length > 0;
                const isSelected = selectedDay === day;

                return (
                  <button
                    key={`day-${day}`}
                    onClick={() => setSelectedDay(day)}
                    className={`aspect-square rounded-xl text-xs font-semibold flex flex-col items-center justify-center relative transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-accent text-white shadow-md shadow-accent/25'
                        : hasEvents
                          ? 'bg-accent/15 border border-accent/30 text-accent hover:bg-accent/25'
                          : 'hover:bg-theme-border/30 text-theme-text-primary'
                    }`}
                  >
                    <span>{day}</span>
                    {hasEvents && !isSelected && (
                      <span className="absolute bottom-1 h-1.5 w-1.5 bg-accent rounded-full animate-pulse"></span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Selected Day Event Details */}
          <div className="flex-1 space-y-2 max-h-[220px] overflow-y-auto pr-1 text-xs">
            <h4 className="text-[11px] font-bold text-theme-text-secondary uppercase tracking-wider">
              Events on {monthNames[calMonth]} {selectedDay || '?'}:
            </h4>
            {selectedDay ? (
              (() => {
                const dayEvents = getDayEvents(selectedDay);
                if (dayEvents.length === 0) {
                  return (
                    <div className="text-xs text-theme-text-secondary py-3 text-center bg-theme-border/10 border border-theme-border/20 rounded-xl">
                      No events scheduled for this date.
                    </div>
                  );
                }
                return dayEvents.map(ev => (
                  ev.isHoliday ? (
                    <div
                      key={ev.id}
                      className="p-3 bg-warning/10 border border-warning/25 rounded-xl flex items-center gap-2"
                    >
                      <PartyPopper className="h-3.5 w-3.5 text-warning shrink-0" />
                      <h5 className="font-semibold text-theme-text-primary text-xs">{ev.title}</h5>
                      <span className="text-[10px] px-2 py-0.5 bg-warning/15 text-warning font-semibold rounded-md ml-auto shrink-0">Holiday</span>
                    </div>
                  ) : (
                    <Link
                      key={ev.id}
                      href={`/dashboard/events/${ev.id}`}
                      className="p-3 bg-theme-border/10 border border-theme-border/20 rounded-xl flex items-center justify-between gap-3 hover:bg-theme-border/20 transition-all block cursor-pointer"
                    >
                      <div>
                        <h5 className="font-semibold text-theme-text-primary text-xs hover:text-accent transition-colors">{ev.title}</h5>
                        <p className="text-[10px] text-theme-text-secondary mt-0.5">{(ev.committees || []).length} Sub-Committees</p>
                      </div>
                      <span className="text-[10px] px-2.5 py-0.5 bg-accent/15 text-accent font-semibold rounded-md capitalize">
                        {getEffectiveEventStatus(ev)}
                      </span>
                    </Link>
                  )
                ));
              })()
            ) : (
              <div className="text-xs text-theme-text-secondary py-3 text-center bg-theme-border/10 border border-theme-border/20 rounded-xl">
                Select a day to view scheduled events.
              </div>
            )}
          </div>
        </div>

        {/* Upcoming Events Sidebar */}
        <div className="glass-panel rounded-2xl p-6 flex flex-col space-y-4">
          <h3 className="text-base font-bold text-theme-text-primary">Upcoming Events</h3>
          <div className="space-y-2 text-xs">
            {upcomingEvents.length === 0 ? (
              <div className="text-xs text-theme-text-secondary py-3 text-center bg-theme-border/10 border border-theme-border/20 rounded-xl">
                No upcoming events scheduled.
              </div>
            ) : (
              upcomingEvents.map(ev => (
                <Link
                  key={ev.id}
                  href={`/dashboard/events/${ev.id}`}
                  className="p-3 bg-theme-border/10 border border-theme-border/20 rounded-xl flex flex-col gap-1 hover:bg-theme-border/20 transition-all block cursor-pointer"
                >
                  <h5 className="font-semibold text-theme-text-primary text-xs hover:text-accent transition-colors">{ev.title}</h5>
                  <p className={`text-[10px] ${ev.datesTBD ? 'text-warning font-semibold' : 'text-theme-text-secondary'}`}>{formatEventDateRange(ev)}</p>
                </Link>
              ))
            )}
          </div>

          <h3 className="text-base font-bold text-theme-text-primary flex items-center gap-1.5 pt-2 border-t border-theme-border/20">
            <PartyPopper className="h-4 w-4 text-warning" />
            Upcoming Holidays
          </h3>
          <div className="space-y-2 text-xs">
            {upcomingHolidays.length === 0 ? (
              <div className="text-xs text-theme-text-secondary py-3 text-center bg-theme-border/10 border border-theme-border/20 rounded-xl">
                No upcoming holidays synced yet.
              </div>
            ) : (
              upcomingHolidays.map(h => (
                <div key={h.id} className="p-3 bg-warning/10 border border-warning/25 rounded-xl flex items-center justify-between gap-2">
                  <h5 className="font-semibold text-theme-text-primary text-xs">{h.title}</h5>
                  <span className="text-[10px] text-warning font-semibold shrink-0">{h.startDate}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
