'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Calendar,
  CheckSquare,
  AlertCircle,
  Megaphone,
  ExternalLink,
  ChevronRight,
  Star,
  Crown,
  Award,
  Users,
  Sparkles
} from 'lucide-react';
import {
  getTasks,
  getEvents,
  getMembers,
  getRatings,
  getAnnouncements,
  updateTaskStatus,
  getStudentLeaderboard,
  getEffectiveEventStatus,
  formatEventDateRange,
  getEventSortTime,
  TaskItem,
  EventItem,
  AnnouncementItem
} from '@/lib/local-data';
import { canViewTaskExtended, canViewEvent, canApprovePendingEvent } from '@/lib/permissions';
import { getRatingColor } from '@/lib/design-tokens';
import { StudentProfileModal } from '@/components/student-profile-modal';

export default function DashboardHome() {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [membersCount, setMembersCount] = useState(0);
  const [announcements, setAnnouncements] = useState<AnnouncementItem[]>([]);
  const [user, setUser] = useState<any>(null);
  
  // Announcements, Events, and Festivals Tab State
  const [activeTab, setActiveTab] = useState<'events' | 'festivals' | 'announcements'>('events');

  // Leaderboard State
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [overallAvgScore, setOverallAvgScore] = useState<number>(0);
  const [hasRatings, setHasRatings] = useState(false);
  const [selectedStudentForProfile, setSelectedStudentForProfile] = useState<string | null>(null);

  useEffect(() => {
    const refreshData = () => {
      const allEvents = getEvents();
      setEvents(allEvents.sort((a, b) => getEventSortTime(a) - getEventSortTime(b)));

      const allTasks = getTasks();
      setTasks(allTasks);
      
      setMembersCount(getMembers().length);
      setAnnouncements(getAnnouncements());
      
      // Dynamic Individual Student Leaderboard
      const studentRanks = getStudentLeaderboard();
      setLeaderboard(studentRanks.slice(0, 5));

      const ratingsList = getRatings();
      setHasRatings(ratingsList.length > 0);
      if (ratingsList.length > 0) {
        const totalScore = ratingsList.reduce((acc, r) => acc + r.overallScore, 0);
        setOverallAvgScore(parseFloat((totalScore / ratingsList.length).toFixed(1)));
      }
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

  const handleAcknowledge = (id: string) => {
    updateTaskStatus(id, 'In Progress');
    setTasks(getTasks());
  };

  const handleComplete = (id: string) => {
    updateTaskStatus(id, 'Completed');
    setTasks(getTasks());
  };

  const handleRequestExtension = (id: string) => {
    updateTaskStatus(id, 'Pending Extension');
    setTasks(getTasks());
  };

  const todayStr = new Date().toISOString().slice(0, 10);

  // Same visibility rule as the Events page: approved/legacy events follow the
  // own-vs-all Group Policy scope; pending/rejected submissions are only shown to
  // their submitter, their resolved approver, or the Super User.
  const visibleEvents = events
    .filter(event => !event.isHoliday)
    .filter(event => {
      if (event.approvalStatus === 'pending_create' || event.approvalStatus === 'rejected') {
        return user?.tier === 1 || event.submittedByEmail === user?.email || canApprovePendingEvent(event, user);
      }
      return canViewEvent(event, user);
    });

  const visibleFestivals = events
    .filter(event => event.isHoliday || event.description?.includes('holiday') || event.description?.includes('festival'))
    .filter(event => event.startDate >= todayStr)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));

  const activeEventsCount = visibleEvents.filter(e => {
    const effective = getEffectiveEventStatus(e, tasks);
    return effective !== 'completed' && effective !== 'archived';
  }).length;

  const getEventsOnDate = (date: Date) => {
    const checkStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    return visibleEvents.filter(e => !e.datesTBD && checkStr >= e.startDate && checkStr <= e.endDate);
  };

  // Filter tasks based on shared permission helper
  const displayedTasks = tasks.filter(task => canViewTaskExtended(task, user));

  // Count tasks awaiting acknowledgment
  const pendingAckCount = displayedTasks.filter(t => t.status === 'Assigned').length;

  const scorePercentage = Math.min(100, Math.max(0, (overallAvgScore / 5.0) * 100));

  return (
    <div className="p-6 md:p-8 space-y-6">
      
      {/* Welcome Card */}
      {user && (
        <div className="glass-panel rounded-3xl p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-gradient-to-r from-accent/10 to-primary/5 border border-accent/20">
          <div>
            <h1 className="text-xl font-bold text-theme-text-primary">Hello! Welcome back, {user.name}</h1>
            <p className="text-xs text-theme-text-secondary mt-1">
              Designation: <span className="font-semibold text-theme-text-primary">{user.role || 'Member'}</span>
              {(user.committee || user.division) && (
                <> &middot; {user.committee ? `Committee: ${user.committee}` : `Division: ${user.division}`}</>
              )}
            </p>
          </div>
          <span className="text-xs font-semibold text-accent px-3.5 py-1.5 bg-accent/15 rounded-xl border border-accent/20">
            {user.role || user.division || 'LEADS Member'}
          </span>
        </div>
      )}

      {/* Banner: Task awaiting acknowledgment */}
      {pendingAckCount > 0 && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 bg-amber-500/15 dark:bg-amber-500/20 border border-amber-500/30 dark:border-amber-400/40 rounded-2xl shadow-lg backdrop-blur-xl animate-in fade-in duration-300">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-300 shrink-0" />
            <span className="text-xs font-bold text-slate-900 dark:text-white">
              You have {pendingAckCount} task(s) awaiting your acknowledgment.
            </span>
          </div>
          <Link 
            href="/dashboard/tasks"
            className="text-xs font-extrabold text-white bg-amber-600 hover:bg-amber-700 dark:bg-amber-500 dark:text-slate-950 dark:hover:bg-amber-400 uppercase tracking-wider px-4 py-2 rounded-xl transition-all shadow-md shadow-amber-500/20 shrink-0 cursor-pointer"
          >
            Review Tasks
          </Link>
        </div>
      )}

      {/* Grid: Stats Widgets */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Active Events */}
        <div className="glass-panel rounded-2xl p-5 flex items-center justify-between">
          <div className="space-y-1.5">
            <span className="text-xs font-semibold text-theme-text-secondary uppercase tracking-wider">Active Events</span>
            <h3 className="text-2xl font-bold text-theme-text-primary">{activeEventsCount}</h3>
            <span className="text-[11px] text-theme-text-secondary font-medium">
              {visibleEvents.length} total planned / active
            </span>
          </div>
          <div className="h-11 w-11 bg-accent/15 rounded-xl flex items-center justify-center border border-accent/15">
            <Calendar className="h-5 w-5 text-accent" />
          </div>
        </div>

        {/* Tasks Assigned */}
        <div className="glass-panel rounded-2xl p-5 flex items-center justify-between">
          <div className="space-y-1.5">
            <span className="text-xs font-semibold text-theme-text-secondary uppercase tracking-wider">Assigned Tasks</span>
            <h3 className="text-2xl font-bold text-theme-text-primary">{displayedTasks.length}</h3>
            <span className="text-[11px] text-success font-semibold">
              {displayedTasks.filter(t => t.status === 'Completed').length} completed
            </span>
          </div>
          <div className="h-11 w-11 bg-success/15 rounded-xl flex items-center justify-center border border-success/15">
            <CheckSquare className="h-5 w-5 text-success" />
          </div>
        </div>

        {/* Members / Roster Count */}
        <div className="glass-panel rounded-2xl p-5 flex items-center justify-between">
          <div className="space-y-1.5">
            <span className="text-xs font-semibold text-theme-text-secondary uppercase tracking-wider">Member Roster</span>
            <h3 className="text-2xl font-bold text-theme-text-primary">{membersCount}</h3>
            <span className="text-[11px] text-accent font-semibold">Active center members</span>
          </div>
          <div className="h-11 w-11 bg-primary/15 rounded-xl flex items-center justify-center border border-primary/15">
            <Users className="h-5 w-5 text-accent" />
          </div>
        </div>

        {/* Performance Rollup */}
        <div className="glass-panel rounded-2xl p-5 flex items-center justify-between">
          <div className="space-y-1.5 flex-1 pr-2">
            <span className="text-xs font-semibold text-theme-text-secondary uppercase tracking-wider">Performance Rollup</span>
            {hasRatings ? (
              <h3 className="text-2xl font-bold text-theme-text-primary">
                {overallAvgScore.toFixed(1)} <span className="text-xs font-normal text-theme-text-secondary">/ 5.0</span>
              </h3>
            ) : (
              <h3 className="text-sm font-semibold text-theme-text-secondary">No ratings yet</h3>
            )}
            {/* Continuous progress track */}
            <div className="w-full bg-theme-border/40 h-2 rounded-full overflow-hidden">
              <div
                className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                style={{ width: `${hasRatings ? scorePercentage : 0}%` }}
              ></div>
            </div>
          </div>
          <div className="h-11 w-11 bg-emerald-500/15 rounded-xl flex items-center justify-center border border-emerald-500/20">
            <Star className="h-5 w-5 text-emerald-500 fill-emerald-500" />
          </div>
        </div>

      </div>

      {/* Grid: Calendar & Leaderboard Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Calendar Quick-Access Card */}
        <div className="glass-panel rounded-2xl p-6 flex flex-col space-y-4">
          <div>
            <h3 className="text-base font-bold text-theme-text-primary">LEADS Event Calendar</h3>
            <p className="text-xs text-theme-text-secondary">Explore scheduled symposiums, workshops, and milestones</p>
          </div>

          <div className="flex-1 flex flex-col items-center justify-center text-center space-y-3 py-6 border border-theme-border/30 rounded-2xl bg-theme-background/10">
            <Calendar className="h-8 w-8 text-accent" />
            <p className="text-xs text-theme-text-secondary max-w-xs">
              {getEventsOnDate(new Date()).length > 0
                ? `${getEventsOnDate(new Date()).length} event(s) happening today.`
                : 'View the full interactive calendar to browse upcoming events by month.'}
            </p>
            <Link
              href="/dashboard/calendar"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-accent hover:bg-primary-light text-white text-xs font-semibold rounded-xl transition-all shadow-md shadow-accent/15 cursor-pointer"
            >
              Open Calendar
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>

        {/* Top Performers Leaderboard */}
        <div className="glass-panel rounded-2xl p-6 flex flex-col space-y-4">
          <div>
            <h3 className="text-base font-bold text-theme-text-primary">Student Performance Leaderboard</h3>
            <p className="text-xs text-theme-text-secondary">Individual student contributor rankings based on task evaluations</p>
          </div>

          <div className="flex-1 space-y-2.5">
            {leaderboard.length === 0 ? (
              <div className="text-center py-10 text-theme-text-secondary text-xs">
                No evaluation scores submitted yet. Visit Ratings to evaluate student tasks.
              </div>
            ) : (
              leaderboard.map((perf, index) => {
                const rankIcons = [
                  <Crown key="crown" className="h-4 w-4 text-amber-400 shrink-0" />,
                  <Award key="award2" className="h-4 w-4 text-slate-300 shrink-0" />,
                  <Award key="award3" className="h-4 w-4 text-amber-600 shrink-0" />,
                ];

                const colorTokens = getRatingColor(perf.score);

                return (
                  <div 
                    key={perf.id || perf.name} 
                    onClick={() => setSelectedStudentForProfile(perf.id || perf.name)}
                    className="flex items-center justify-between p-3 bg-theme-border/10 border border-theme-border/20 rounded-2xl hover:bg-accent/10 hover:border-accent/30 transition-all text-xs cursor-pointer group"
                    title="Click to view student profile and outcomes"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-5 flex justify-center">
                        {index < 3 ? rankIcons[index] : <span className="font-bold text-theme-text-secondary">#{index + 1}</span>}
                      </div>

                      <div className="h-8 w-8 rounded-xl flex items-center justify-center border font-bold text-xs bg-accent/15 border-accent/20 text-accent group-hover:scale-105 transition-transform">
                        {perf.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                      </div>

                      <div>
                        <h4 className="font-bold text-theme-text-primary text-xs leading-snug group-hover:text-accent transition-colors">{perf.name}</h4>
                        <div className="flex items-center gap-1.5 text-[10px] text-theme-text-secondary">
                          <span className="font-medium">{perf.division}</span>
                          <span>&middot;</span>
                          <span>{perf.completedTasks} tasks done</span>
                        </div>
                      </div>
                    </div>

                    <div className={`flex items-center gap-1 px-2.5 py-1 rounded-xl font-bold text-xs border ${colorTokens.bg} ${colorTokens.text} ${colorTokens.border}`}>
                      <span>{perf.score > 0 ? perf.score.toFixed(1) : '—'}</span>
                      <Star className="h-3 w-3 fill-current" />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

      </div>

      {/* Grid: Tasks Table & Dynamic Tabbed Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Active Tasks List */}
        <div className="glass-panel rounded-2xl p-6 lg:col-span-2 flex flex-col space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-theme-text-primary">Actionable Tasks</h3>
              <p className="text-xs text-theme-text-secondary">Current assignments and workflow progress</p>
            </div>
            <Link 
              href="/dashboard/tasks" 
              className="text-xs font-semibold text-accent hover:underline flex items-center gap-1"
            >
              View All Tasks <ExternalLink className="h-3 w-3" />
            </Link>
          </div>

          <div className="overflow-x-auto">
            {displayedTasks.length === 0 ? (
              <div className="text-center py-8 text-theme-text-secondary text-xs">
                {user?.tier === 4 ? 'No task obligations for Advisory Board role.' : 'No active tasks assigned to your view.'}
              </div>
            ) : (
              <table className="min-w-full text-xs text-left">
                <thead>
                  <tr className="text-theme-text-secondary border-b border-theme-border/40 text-xs">
                    <th className="pb-3 font-semibold">Task</th>
                    <th className="pb-3 font-semibold">Event</th>
                    <th className="pb-3 font-semibold">Due Date</th>
                    <th className="pb-3 font-semibold">Status</th>
                    <th className="pb-3 font-semibold text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-theme-border/20">
                  {displayedTasks.slice(0, 5).map(task => (
                    <tr key={task.id} className="hover:bg-theme-border/10 transition-all">
                      <td className="py-3 pr-2 font-medium text-theme-text-primary">{task.title}</td>
                      <td className="py-3 pr-2 text-theme-text-secondary">{task.event || 'Standalone'}</td>
                      <td className="py-3 pr-2 text-theme-text-secondary">{task.dueDate}</td>
                      <td className="py-3 pr-2">
                        <span className={`inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                          task.status === 'Assigned' 
                             ? 'bg-accent/15 text-accent border border-accent/20' 
                             : task.status === 'In Progress' 
                               ? 'bg-warning/15 text-warning border border-warning/20' 
                               : task.status === 'Completed'
                                 ? 'bg-success/15 text-success border border-success/20'
                                 : 'bg-danger/15 text-danger border border-danger/20'
                        }`}>
                          {task.status}
                        </span>
                      </td>
                      <td className="py-3 text-right">
                        {task.status === 'Assigned' ? (
                          <button
                            onClick={() => handleAcknowledge(task.id)}
                            className="px-2.5 py-1 bg-accent hover:bg-primary-light text-white text-[10px] font-semibold rounded-lg transition-all cursor-pointer"
                          >
                            Acknowledge
                          </button>
                        ) : task.status === 'In Progress' ? (
                          <div className="flex justify-end gap-1.5">
                            <button
                              onClick={() => handleComplete(task.id)}
                              className="px-2.5 py-1 bg-success hover:bg-success/90 text-white text-[10px] font-semibold rounded-lg transition-all cursor-pointer"
                            >
                              Complete
                            </button>
                            <button
                              onClick={() => handleRequestExtension(task.id)}
                              className="px-2 py-1 bg-theme-border/30 hover:bg-theme-border/50 text-theme-text-primary text-[10px] font-semibold rounded-lg transition-all cursor-pointer"
                              title="Request Deadline Extension"
                            >
                              Extend
                            </button>
                          </div>
                        ) : (
                          <span className="text-[10px] text-theme-text-secondary">Closed</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Dynamic Tabbed Events, Festivals & Announcements Panel */}
        <div className="glass-panel rounded-2xl p-6 flex flex-col space-y-4">
          <div className="flex border-b border-theme-border/30 pb-2.5 gap-2 flex-wrap">
            <button
              onClick={() => setActiveTab('events')}
              className={`pb-1 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'events'
                  ? 'text-accent border-b-2 border-accent'
                  : 'text-theme-text-secondary hover:text-theme-text-primary'
              }`}
            >
              <Calendar className="h-3.5 w-3.5" />
              Upcoming Events ({visibleEvents.filter(ev => getEffectiveEventStatus(ev, tasks) !== 'completed' && getEffectiveEventStatus(ev, tasks) !== 'archived').length})
            </button>

            <button
              onClick={() => setActiveTab('festivals')}
              className={`pb-1 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'festivals'
                  ? 'text-accent border-b-2 border-accent'
                  : 'text-theme-text-secondary hover:text-theme-text-primary'
              }`}
            >
              <Sparkles className="h-3.5 w-3.5" />
              Festivals ({visibleFestivals.length})
            </button>

            <button
              onClick={() => setActiveTab('announcements')}
              className={`pb-1 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'announcements'
                  ? 'text-accent border-b-2 border-accent'
                  : 'text-theme-text-secondary hover:text-theme-text-primary'
              }`}
            >
              <Megaphone className="h-3.5 w-3.5" />
              Announcements
            </button>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto max-h-[300px] pr-1 text-xs">
            {activeTab === 'events' ? (
              (() => {
                const upcoming = visibleEvents.filter(ev => {
                  const effective = getEffectiveEventStatus(ev, tasks);
                  return effective !== 'completed' && effective !== 'archived';
                });
                if (upcoming.length === 0) {
                  return <div className="text-center py-8 text-theme-text-secondary text-xs">No upcoming club/university events.</div>;
                }
                return upcoming.map(ev => (
                  <div key={ev.id} className="p-3 bg-white/40 dark:bg-white/5 border border-theme-border/20 rounded-xl space-y-1 hover:bg-white/60 dark:hover:bg-white/10 transition-all">
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold text-theme-text-primary text-xs">{ev.title}</h4>
                      <span className="text-[10px] px-2 py-0.5 bg-accent/15 text-accent font-semibold rounded-md capitalize">{getEffectiveEventStatus(ev, tasks)}</span>
                    </div>
                    <p className="text-[10px] text-theme-text-secondary line-clamp-2">{ev.description}</p>
                    <p className={`text-[10px] font-medium pt-1 ${ev.datesTBD ? 'text-warning' : 'text-theme-text-secondary'}`}>{formatEventDateRange(ev)}</p>
                  </div>
                ));
              })()
            ) : activeTab === 'festivals' ? (
              (() => {
                if (visibleFestivals.length === 0) {
                  return <div className="text-center py-8 text-theme-text-secondary text-xs">No upcoming festivals in the next 30 days.</div>;
                }
                return visibleFestivals.slice(0, 8).map(fest => (
                  <div key={fest.id} className="p-3 bg-white/40 dark:bg-white/5 border border-theme-border/20 rounded-xl space-y-1 hover:bg-white/60 dark:hover:bg-white/10 transition-all flex items-start justify-between gap-3">
                    <div className="space-y-0.5 min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="font-semibold text-theme-text-primary text-xs truncate">{fest.title}</h4>
                        <span className="text-[10px] px-1.5 py-0.2 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-semibold rounded shrink-0">Festival</span>
                      </div>
                      <p className="text-[10px] text-theme-text-secondary line-clamp-1">{fest.description}</p>
                      <p className="text-[10px] font-medium text-theme-text-secondary">{fest.startDate}</p>
                    </div>
                    <Link
                      href="/dashboard/festivals"
                      className="text-[10px] text-accent hover:underline font-semibold shrink-0"
                    >
                      Details &rarr;
                    </Link>
                  </div>
                ));
              })()
            ) : (
              announcements.length === 0 ? (
                <div className="text-center py-8 text-theme-text-secondary text-xs">No announcements published.</div>
              ) : (
                announcements.map(ann => (
                  <div key={ann.id} className="p-3 bg-white/40 dark:bg-white/5 border border-theme-border/20 rounded-xl space-y-1 hover:bg-white/60 dark:hover:bg-white/10 transition-all">
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold text-theme-text-primary text-xs">{ann.title}</h4>
                      <span className="text-[10px] text-accent font-medium px-2 py-0.5 bg-accent/10 rounded">{ann.scope}</span>
                    </div>
                    <p className="text-[10px] text-theme-text-secondary line-clamp-2">{ann.content}</p>
                    <p className="text-[10px] text-theme-text-secondary font-medium pt-1">{ann.publishedAt} &middot; by {ann.authorName}</p>
                  </div>
                ))
              )
            )}
          </div>
        </div>

      </div>

      {/* Student Profile Modal */}
      <StudentProfileModal
        memberIdOrName={selectedStudentForProfile}
        onClose={() => setSelectedStudentForProfile(null)}
      />

    </div>
  );
}
