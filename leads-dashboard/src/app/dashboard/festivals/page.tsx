'use client';

import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Calendar,
  Search,
  CheckCircle2,
  Clock,
  Share2,
  Palette,
  CheckSquare,
  ChevronRight
} from 'lucide-react';
import Link from 'next/link';
import { getEvents, getTasks, addTask, EventItem, TaskItem, Member } from '@/lib/local-data';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';

export default function FestivalsPage() {
  const [user, setUser] = useState<Member | null>(null);
  const [festivals, setFestivals] = useState<EventItem[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMonth, setSelectedMonth] = useState<string>('all');
  
  // Default to 'upcoming_7' ("This Week")
  const [timeFilter, setTimeFilter] = useState<'upcoming_7' | 'upcoming_30' | 'all' | 'past'>('upcoming_7');
  const [successMsg, setSuccessMsg] = useState('');

  const refreshData = () => {
    const allEvents = getEvents();
    const holidayList = allEvents.filter(e => e.isHoliday || e.description?.includes('holiday') || e.description?.includes('festival'));
    setFestivals(holidayList);
    setTasks(getTasks());
  };

  useEffect(() => {
    const savedUser = localStorage.getItem('user');
    if (savedUser) {
      try {
        setUser(JSON.parse(savedUser));
      } catch (e) {
        console.error(e);
      }
    }
    refreshData();

    window.addEventListener('leads-data-sync', refreshData);
    window.addEventListener('storage', refreshData);
    return () => {
      window.removeEventListener('leads-data-sync', refreshData);
      window.removeEventListener('storage', refreshData);
    };
  }, []);

  const triggerSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 4000);
  };

  const todayStr = new Date().toISOString().slice(0, 10);

  // Helper to find related social media post task for a festival
  const getFestivalSocialTask = (festival: EventItem): TaskItem | undefined => {
    return tasks.find(t => 
      t.eventId === festival.id ||
      t.event === festival.title ||
      t.title.toLowerCase().includes(festival.title.toLowerCase())
    );
  };

  // Helper to request a social media creative post for a festival
  const handleCreateSocialPostTask = (festival: EventItem) => {
    if (!user) return;
    const taskTitle = `Social media post needed for "${festival.title}"?`;
    addTask({
      title: taskTitle,
      event: festival.title,
      eventId: festival.id,
      assignee: user.name || 'Media & Design Head',
      assigneeEmail: user.email || 'design@leads.edu',
      assigneeType: 'individual',
      status: 'Assigned',
      dueDate: festival.startDate,
      creatorName: user.name || 'User',
      isDesignDeliverable: true,
      workflowType: 'holiday_social_approval',
    });
    refreshData();
    triggerSuccess(`Social media post task requested for ${festival.title}!`);
  };

  // Filter counts
  const thisWeekCount = festivals.filter(f => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    const in7Days = d.toISOString().slice(0, 10);
    return f.startDate >= todayStr && f.startDate <= in7Days;
  }).length;

  const next30DaysCount = festivals.filter(f => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    const in30Days = d.toISOString().slice(0, 10);
    return f.startDate >= todayStr && f.startDate <= in30Days;
  }).length;

  // Filtered festivals list
  const filteredFestivals = festivals.filter(f => {
    const matchesSearch = f.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (f.description && f.description.toLowerCase().includes(searchTerm.toLowerCase()));

    if (!matchesSearch) return false;

    if (selectedMonth !== 'all') {
      const monthStr = f.startDate.slice(5, 7);
      if (monthStr !== selectedMonth) return false;
    }

    if (timeFilter === 'upcoming_7') {
      const d = new Date();
      d.setDate(d.getDate() + 7);
      const in7Days = d.toISOString().slice(0, 10);
      return f.startDate >= todayStr && f.startDate <= in7Days;
    }

    if (timeFilter === 'upcoming_30') {
      const d = new Date();
      d.setDate(d.getDate() + 30);
      const in30Days = d.toISOString().slice(0, 10);
      return f.startDate >= todayStr && f.startDate <= in30Days;
    }

    if (timeFilter === 'past') {
      return f.startDate < todayStr;
    }

    return true;
  }).sort((a, b) => a.startDate.localeCompare(b.startDate));

  return (
    <div className="p-6 md:p-8 space-y-6">
      
      {/* Header Banner */}
      <div className="glass-panel rounded-3xl p-6 md:p-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 border border-white/40 dark:border-white/20 shadow-2xl bg-gradient-to-r from-accent/20 via-primary/15 to-transparent bg-white/90 dark:bg-[#0D1F38]/90 backdrop-blur-2xl">
        <div className="space-y-2">
          <div className="flex items-center gap-2.5">
            <span className="p-2.5 rounded-2xl bg-accent/20 border border-accent/30 text-accent shadow-md">
              <Sparkles className="h-6 w-6" />
            </span>
            <div>
              <h1 className="text-2xl font-black text-theme-text-primary tracking-tight">Festivals & Observances</h1>
              <p className="text-xs text-theme-text-secondary">Official Indian National Observances, University Holidays & Social Media Campaign Tracker</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Link href="/dashboard/tasks">
            <Button variant="solid" color="accent" size="sm" startContent={<CheckSquare className="h-4 w-4" />}>
              View Social Tasks
            </Button>
          </Link>
          <Link href="/dashboard/calendar">
            <Button variant="bordered" color="default" size="sm" startContent={<Calendar className="h-4 w-4" />}>
              Open Calendar
            </Button>
          </Link>
        </div>
      </div>

      {/* Success Notification */}
      {successMsg && (
        <div className="p-4 bg-emerald-500/20 border border-emerald-500/40 rounded-2xl text-emerald-950 dark:text-emerald-100 text-xs font-bold flex items-center gap-2 shadow-lg backdrop-blur-xl animate-in fade-in">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          {successMsg}
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="glass-panel rounded-3xl p-4 flex flex-col md:flex-row items-center justify-between gap-4 border border-slate-200/90 dark:border-white/20 shadow-xl bg-white/95 dark:bg-[#0D1F38]/95 backdrop-blur-2xl">
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 dark:text-slate-400" />
          <input
            type="text"
            placeholder="Search festivals or observances..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 text-xs rounded-xl bg-slate-50 dark:bg-white/10 border border-slate-300 dark:border-white/20 text-slate-900 dark:text-white placeholder:text-slate-500 focus:outline-none focus:border-accent font-medium shadow-inner"
          />
        </div>

        <div className="flex items-center gap-2.5 flex-wrap w-full md:w-auto justify-end">
          {/* Time Filter Pills: This Week -> Next 30 Days -> All */}
          <div className="flex items-center gap-1.5 bg-slate-100/90 dark:bg-slate-900/80 p-1.5 rounded-2xl border border-slate-200/90 dark:border-white/15 shadow-sm">
            <button
              onClick={() => setTimeFilter('upcoming_7')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                timeFilter === 'upcoming_7'
                  ? 'bg-accent text-white shadow-md shadow-accent/30 scale-105'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-white/80 dark:hover:bg-white/10'
              }`}
            >
              This Week ({thisWeekCount})
            </button>
            <button
              onClick={() => setTimeFilter('upcoming_30')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                timeFilter === 'upcoming_30'
                  ? 'bg-accent text-white shadow-md shadow-accent/30 scale-105'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-white/80 dark:hover:bg-white/10'
              }`}
            >
              Next 30 Days ({next30DaysCount})
            </button>
            <button
              onClick={() => setTimeFilter('all')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                timeFilter === 'all'
                  ? 'bg-accent text-white shadow-md shadow-accent/30 scale-105'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-white/80 dark:hover:bg-white/10'
              }`}
            >
              All ({festivals.length})
            </button>
          </div>

          {/* Month Selector */}
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="px-3.5 py-2 text-xs font-semibold rounded-xl bg-slate-50 dark:bg-white/10 border border-slate-300 dark:border-white/20 text-slate-900 dark:text-white focus:outline-none focus:border-accent cursor-pointer shadow-sm"
          >
            <option value="all">All Months</option>
            <option value="01">January</option>
            <option value="02">February</option>
            <option value="03">March</option>
            <option value="04">April</option>
            <option value="05">May</option>
            <option value="06">June</option>
            <option value="07">July</option>
            <option value="08">August</option>
            <option value="09">September</option>
            <option value="10">October</option>
            <option value="11">November</option>
            <option value="12">December</option>
          </select>
        </div>
      </div>

      {/* Festivals Grid */}
      {filteredFestivals.length === 0 ? (
        <div className="glass-panel rounded-3xl p-12 text-center space-y-3 border border-slate-200/90 dark:border-white/20 shadow-xl bg-white/95 dark:bg-[#0D1F38]/95">
          <Sparkles className="h-10 w-10 text-slate-400 mx-auto" />
          <h3 className="text-base font-bold text-slate-900 dark:text-white">No festivals match the selected timeframe</h3>
          <p className="text-xs text-slate-600 dark:text-slate-300 max-w-sm mx-auto font-medium">
            Try switching to <strong>Next 30 Days</strong> or <strong>All ({festivals.length})</strong> to view upcoming observances.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredFestivals.map((festival) => {
            const socialTask = getFestivalSocialTask(festival);
            const isUpcoming = festival.startDate >= todayStr;
            const dateObj = new Date(festival.startDate);
            const formattedDate = isNaN(dateObj.getTime())
              ? festival.startDate
              : dateObj.toLocaleDateString('en-IN', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                });

            return (
              <div
                key={festival.id}
                className={`glass-panel rounded-3xl p-5 md:p-6 flex flex-col justify-between transition-all duration-300 border shadow-lg shadow-slate-200/60 dark:shadow-black/40 bg-white/95 dark:bg-[#0D1F38]/95 backdrop-blur-2xl ${
                  isUpcoming
                    ? 'border-slate-300 dark:border-accent/40 hover:border-accent hover:shadow-2xl'
                    : 'border-slate-200 dark:border-white/10 opacity-80'
                }`}
              >
                {/* Card Header */}
                <div className="space-y-3 pb-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <Chip variant="flat" color={isUpcoming ? 'accent' : 'default'} size="sm">
                      {isUpcoming ? 'Upcoming' : 'Past Observance'}
                    </Chip>
                    <span className="text-[11px] font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 bg-slate-100 dark:bg-white/10 px-2.5 py-1 rounded-xl border border-slate-200 dark:border-white/15">
                      <Clock className="h-3.5 w-3.5 text-accent" />
                      {formattedDate}
                    </span>
                  </div>

                  <h3 className="text-lg font-black text-slate-900 dark:text-white leading-tight">
                    {festival.title}
                  </h3>

                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed font-medium">
                    {festival.description || 'Indian public holiday / festival (auto-synced weekly).'}
                  </p>
                </div>

                {/* Social Media Status Block */}
                <div className="space-y-4 pt-2">
                  <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-white/15 space-y-2.5 shadow-sm">
                    <div className="flex items-center justify-between text-xs gap-2">
                      <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                        <Share2 className="h-4 w-4 text-accent" />
                        Social Media Post:
                      </span>
                      {socialTask ? (
                        <Chip
                          variant="flat"
                          color={socialTask.status === 'Completed' ? 'success' : 'warning'}
                          size="sm"
                        >
                          {socialTask.status === 'Completed' ? 'Post Ready (Done)' : 'Task in Progress'}
                        </Chip>
                      ) : (
                        <Chip variant="flat" color="default" size="sm">
                          No Post Requested
                        </Chip>
                      )}
                    </div>

                    {socialTask && (
                      <p className="text-[11px] text-slate-600 dark:text-slate-300 truncate pt-1 border-t border-slate-200 dark:border-white/10">
                        Assigned to: <strong className="text-slate-900 dark:text-white">{socialTask.assignee}</strong> ({socialTask.status})
                      </p>
                    )}
                  </div>

                  {/* Card Actions Footer */}
                  <div className="pt-3 border-t border-slate-200 dark:border-white/15 flex items-center justify-between gap-2">
                    {socialTask ? (
                      <Link
                        href={`/dashboard/tasks?highlight=${socialTask.id}`}
                        className="text-xs font-bold text-accent hover:underline flex items-center gap-1"
                      >
                        View Assigned Task <ChevronRight className="h-3.5 w-3.5" />
                      </Link>
                    ) : (
                      <Button
                        variant="solid"
                        color="accent"
                        size="sm"
                        onClick={() => handleCreateSocialPostTask(festival)}
                        startContent={<Palette className="h-3.5 w-3.5" />}
                      >
                        Request Social Post (Yes)
                      </Button>
                    )}

                    <Link href={`/dashboard/calendar?date=${festival.startDate}`}>
                      <Button variant="bordered" color="default" size="sm">
                        In Calendar
                      </Button>
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
