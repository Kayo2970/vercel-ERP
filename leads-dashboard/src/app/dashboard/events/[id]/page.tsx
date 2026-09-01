'use client';

import React, { useState, useEffect, use } from 'react';
import Link from 'next/link';
import {
  ChevronLeft,
  Calendar,
  MapPin,
  Users,
  CheckSquare,
  Plus,
  Trash2,
  UserPlus,
  CheckCircle2,
  User,
  Award,
  Wallet,
  Landmark,
  TrendingUp,
} from 'lucide-react';
import {
  getEventById,
  getMembers,
  getTasks,
  getBudgets,
  getReimbursements,
  addTask,
  addEventCommittee,
  updateEventCommitteeMembers,
  deleteEventCommittee,
  formatEventDateRange,
  getEventSponsors,
  getEventSponsorTotal,
  EventItem,
  EventCommittee,
  Member,
  TaskItem
} from '@/lib/local-data';
import { canManageEvents } from '@/lib/permissions';
import { ConfirmModal } from '@/components/ui/confirm-modal';
import { StudentProfileModal } from '@/components/student-profile-modal';

export default function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const eventId = resolvedParams.id;

  const [event, setEvent] = useState<EventItem | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [user, setUser] = useState<any>(null);

  // Modals & States
  const [isAddCommitteeModalOpen, setIsAddCommitteeModalOpen] = useState(false);
  const [newCommitteeName, setNewCommitteeName] = useState('');

  const [managingCommittee, setManagingCommittee] = useState<EventCommittee | null>(null);
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);

  const [isAddTaskModalOpen, setIsAddTaskModalOpen] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskCommitteeId, setTaskCommitteeId] = useState('');
  const [taskAssigneeId, setTaskAssigneeId] = useState('');
  const [taskDueDate, setTaskDueDate] = useState('');

  const [deletingCommitteeId, setDeletingCommitteeId] = useState<string | null>(null);
  const [selectedStudentForProfile, setSelectedStudentForProfile] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    const refreshData = () => {
      const loadedEvent = getEventById(eventId);
      setEvent(loadedEvent);
      setMembers(getMembers());
      setTasks(getTasks().filter(t => t.eventId === eventId || t.event === loadedEvent?.title));
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
  }, [eventId]);

  const triggerSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 4000);
  };

  const handleCreateCommittee = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCommitteeName.trim() || !event) return;

    addEventCommittee(event.id, newCommitteeName.trim(), user?.name || 'User');
    setNewCommitteeName('');
    setIsAddCommitteeModalOpen(false);
    setEvent(getEventById(eventId));
    triggerSuccess(`Created event committee "${newCommitteeName.trim()}"`);
  };

  const openManageMembers = (committee: EventCommittee) => {
    setManagingCommittee(committee);
    setSelectedMemberIds([...committee.memberIds]);
  };

  const handleToggleMember = (memberId: string) => {
    setSelectedMemberIds(prev => 
      prev.includes(memberId) ? prev.filter(id => id !== memberId) : [...prev, memberId]
    );
  };

  const handleSaveCommitteeMembers = () => {
    if (!event || !managingCommittee) return;

    updateEventCommitteeMembers(event.id, managingCommittee.id, selectedMemberIds, user?.name || 'User');
    setManagingCommittee(null);
    setEvent(getEventById(eventId));
    triggerSuccess(`Updated student roster for "${managingCommittee.name}"`);
  };

  const handleConfirmDeleteCommittee = () => {
    if (!event || !deletingCommitteeId) return;

    deleteEventCommittee(event.id, deletingCommitteeId, user?.name || 'User');
    setDeletingCommitteeId(null);
    setEvent(getEventById(eventId));
    triggerSuccess('Removed committee from event.');
  };

  const handleCreateTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskTitle || !taskDueDate || !event) return;

    const assignedMember = members.find(m => m.id === taskAssigneeId);
    const assignedComm = event.committees.find(c => c.id === taskCommitteeId);

    addTask({
      title: taskTitle,
      event: event.title,
      eventId: event.id,
      eventCommitteeId: taskCommitteeId || undefined,
      eventCommitteeName: assignedComm?.name || undefined,
      assignee: assignedMember ? assignedMember.name : (assignedComm ? assignedComm.name : 'Unassigned'),
      assigneeId: assignedMember?.id,
      assigneeEmail: assignedMember?.email,
      assigneeType: assignedMember ? 'individual' : 'committee',
      dueDate: taskDueDate,
      creatorName: user?.name || 'Leadership'
    });

    setTaskTitle('');
    setTaskCommitteeId('');
    setTaskAssigneeId('');
    setTaskDueDate('');
    setIsAddTaskModalOpen(false);

    setTasks(getTasks().filter(t => t.eventId === eventId || t.event === event.title));
    triggerSuccess('Event deliverable task assigned.');
  };

  const isLeadership = canManageEvents(user);

  if (!event) {
    return (
      <div className="p-6 md:p-8 space-y-6">
        <Link href="/dashboard/events" className="inline-flex items-center gap-1.5 text-xs text-accent hover:underline font-semibold">
          <ChevronLeft className="h-4 w-4" /> Back to Events
        </Link>
        <div className="glass-panel rounded-2xl p-12 text-center text-theme-text-secondary text-xs">
          Event not found or has been removed.
        </div>
      </div>
    );
  }

  // Calculate student participants for this event
  const allEventMemberIds = Array.from(new Set(event.committees.flatMap(c => c.memberIds)));
  const eventParticipants = members.filter(m => allEventMemberIds.includes(m.id));

  // Eligible students for committees (Core Committee and Training Associates)
  const eligibleStudents = members.filter(m => m.division === 'Core Committee' || m.division === 'Training Associate');

  return (
    <div className="p-6 md:p-8 space-y-6">
      
      {/* Alert Banner */}
      {successMsg && (
        <div className="flex items-center gap-3 p-4 bg-success/15 border border-success/20 rounded-2xl text-theme-text-primary text-xs animate-in fade-in duration-300">
          <CheckCircle2 className="h-5 w-5 text-success shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Breadcrumb & Navigation */}
      <div className="flex items-center justify-between">
        <Link 
          href="/dashboard/events"
          className="inline-flex items-center gap-1 text-xs text-theme-text-secondary hover:text-accent font-semibold transition-all cursor-pointer"
        >
          <ChevronLeft className="h-4 w-4" />
          All Events
        </Link>
        <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider ${
          event.status === 'active' ? 'bg-success/15 text-success border border-success/30' :
          event.status === 'completed' ? 'bg-primary/15 text-primary-light border border-primary/30' :
          'bg-warning/15 text-warning border border-warning/30'
        }`}>
          {event.status}
        </span>
      </div>

      {/* Event Header Banner */}
      <div className="glass-panel rounded-3xl p-6 md:p-8 space-y-4 border border-theme-border/40 relative overflow-hidden">
        <div className="space-y-2">
          <h1 className="text-2xl font-black text-theme-text-primary tracking-tight">{event.title}</h1>
          <p className="text-xs text-theme-text-secondary max-w-3xl leading-relaxed">{event.description}</p>
        </div>

        <div className="flex flex-wrap items-center gap-6 pt-3 border-t border-theme-border/20 text-xs text-theme-text-secondary">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-accent" />
            <span className={event.datesTBD ? 'text-warning font-semibold' : ''}>{formatEventDateRange(event)}</span>
          </div>
          {event.location && (
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-warning" />
              <span>{event.location}</span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-accent" />
            <span>{event.committees.length} Event Committees &middot; {eventParticipants.length} Student Organizers</span>
          </div>
        </div>
      </div>

      {/* Event Financial & Budget Health Card (Integrated with Budgeting Module) */}
      {(() => {
        const allBudgets = getBudgets();
        const allReimbursements = getReimbursements();

        // Calculate proposed budget allocated to this event
        let proposedAmount = 0;
        allBudgets.forEach((b) => {
          if (b.eventId === event.id) {
            proposedAmount += b.amount || b.proposedAmount || 0;
          }
          if (b.lineItems) {
            b.lineItems.forEach((li) => {
              if (li.eventId === event.id) {
                proposedAmount += li.amount || li.proposedAmount || 0;
              }
            });
          }
        });

        // Calculate actual approved reimbursements for this event
        const actualSpent = allReimbursements
          .filter((r) => r.eventId === event.id && r.status === 'Approved')
          .reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

        // Calculate sponsors and surplus for this event
        const eventSponsors = getEventSponsors(event.id);
        const sponsorTotal = getEventSponsorTotal(event);
        const sponsorCovered = Math.min(actualSpent, sponsorTotal);
        const surplusReturned = Math.max(0, sponsorTotal - actualSpent);

        const variance = proposedAmount - actualSpent;
        const percentUsed = proposedAmount > 0 ? Math.min(Math.round((actualSpent / proposedAmount) * 100), 100) : 0;

        return (
          <div className="glass-panel rounded-2xl p-5 border border-theme-card-border space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="h-10 w-10 rounded-xl bg-accent/15 border border-accent/30 flex items-center justify-center text-accent shrink-0">
                  <Wallet className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-theme-text-primary flex items-center gap-2">
                    Event Financial Health & Budget Status
                    <Link
                      href="/dashboard/budget"
                      className="text-[10px] text-accent hover:underline font-semibold flex items-center gap-0.5"
                    >
                      View in Budget Module &rarr;
                    </Link>
                  </h3>
                  <p className="text-[11px] text-theme-text-secondary">
                    Synced live with Budgeting Module & Approved Reimbursements
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-4 text-xs">
                <div>
                  <span className="text-[10px] text-theme-text-secondary block font-medium uppercase tracking-wider">
                    Allocated Proposed Budget
                  </span>
                  <span className="font-extrabold text-accent text-sm">
                    ₹{proposedAmount.toLocaleString()}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-theme-text-secondary block font-medium uppercase tracking-wider">
                    Realized Actual Spent
                  </span>
                  <span className="font-extrabold text-emerald-400 text-sm">
                    ₹{actualSpent.toLocaleString()}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-theme-text-secondary block font-medium uppercase tracking-wider">
                    Variance / Forecast
                  </span>
                  <span
                    className={`font-extrabold text-sm ${
                      variance >= 0 ? 'text-emerald-400' : 'text-danger'
                    }`}
                  >
                    {variance >= 0 ? `+₹${variance.toLocaleString()}` : `-₹${Math.abs(variance).toLocaleString()}`}
                  </span>
                </div>
              </div>
            </div>

            {/* Event Sponsorship & Surplus Return Status Banner */}
            {sponsorTotal > 0 && (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/25 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-emerald-400">
                    🤝 Event Sponsors ({eventSponsors.map((s) => s.name).join(', ')}): ₹{sponsorTotal.toLocaleString()}
                  </span>
                </div>
                <div className="text-[11px] text-theme-text-secondary">
                  {actualSpent > 0 ? (
                    <span>
                      <strong className="text-emerald-400">₹{sponsorCovered.toLocaleString()}</strong> depleted from sponsor &middot;{' '}
                      <strong className="text-indigo-400">₹{surplusReturned.toLocaleString()}</strong> surplus returned to Centre
                    </span>
                  ) : (
                    <span>Fully sponsored — ₹{sponsorTotal.toLocaleString()} surplus available</span>
                  )}
                </div>
              </div>
            )}

            {/* Budget Progress Bar */}
            {proposedAmount > 0 && (
              <div className="space-y-1 pt-1">
                <div className="flex justify-between text-[10px] text-theme-text-secondary font-medium">
                  <span>Budget Utilization: {percentUsed}%</span>
                  <span>{variance >= 0 ? `₹${variance.toLocaleString()} remaining` : 'Over budget!'}</span>
                </div>
                <div className="h-2 w-full bg-theme-background/60 rounded-full overflow-hidden border border-theme-border/20">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      actualSpent > proposedAmount
                        ? 'bg-danger'
                        : percentUsed > 85
                        ? 'bg-warning'
                        : 'bg-emerald-500'
                    }`}
                    style={{ width: `${percentUsed}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Main Grid: Event Committees (Sub-categories) & Event Tasks */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Event Committees (Sub-categories) */}
        <div className="glass-panel rounded-2xl p-6 lg:col-span-1 space-y-5 flex flex-col">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-theme-text-primary uppercase tracking-wider">Event Committees</h3>
              <p className="text-[11px] text-theme-text-secondary">Sub-category units executing this event</p>
            </div>
            {isLeadership && (
              <button
                onClick={() => setIsAddCommitteeModalOpen(true)}
                className="px-2.5 py-1.5 bg-accent hover:bg-primary-light text-white text-[11px] font-bold rounded-lg transition-all flex items-center gap-1 cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Unit
              </button>
            )}
          </div>

          <div className="space-y-3 flex-1 overflow-y-auto max-h-[600px] pr-1">
            {event.committees.length === 0 ? (
              <div className="text-center py-8 text-theme-text-secondary text-xs bg-theme-border/5 rounded-xl border border-theme-border/20">
                No committee sub-units added to this event yet.
              </div>
            ) : (
              event.committees.map(committee => {
                const assignedStudents = members.filter(m => committee.memberIds.includes(m.id));
                
                return (
                  <div key={committee.id} className="p-4 bg-theme-border/10 border border-theme-border/20 rounded-xl space-y-3 text-xs">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className="font-bold text-theme-text-primary text-xs">{committee.name}</h4>
                        <span className="text-[10px] text-theme-text-secondary">{assignedStudents.length} student members assigned</span>
                      </div>
                      {isLeadership && (
                        <button
                          onClick={() => setDeletingCommitteeId(committee.id)}
                          className="p-1 text-danger hover:bg-danger/10 rounded cursor-pointer transition-all"
                          title="Remove Committee"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>

                    {/* Member Avatars */}
                    <div className="flex flex-wrap gap-1.5">
                      {assignedStudents.length === 0 ? (
                        <span className="text-[11px] text-theme-text-secondary italic">No students assigned</span>
                      ) : (
                        assignedStudents.map(s => (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => setSelectedStudentForProfile(s.id)}
                            className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md bg-accent/15 hover:bg-accent/25 text-theme-text-primary border border-accent/25 transition-all cursor-pointer"
                            title="Click to view student profile"
                          >
                            <User className="h-2.5 w-2.5 text-accent" />
                            {s.name}
                          </button>
                        ))
                      )}
                    </div>

                    {isLeadership && (
                      <button
                        onClick={() => openManageMembers(committee)}
                        className="w-full py-1.5 bg-theme-border/30 hover:bg-theme-border/50 text-theme-text-primary text-[11px] font-semibold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        <UserPlus className="h-3 w-3" />
                        Assign / Manage Students
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Event Deliverables / Tasks & Roster */}
        <div className="glass-panel rounded-2xl p-6 lg:col-span-2 space-y-6">
          
          {/* Section 1: Event Tasks */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-theme-text-primary uppercase tracking-wider flex items-center gap-2">
                  <CheckSquare className="h-4 w-4 text-accent" />
                  Event Tasks & Deliverables ({tasks.length})
                </h3>
                <p className="text-[11px] text-theme-text-secondary">Track deadlines and review deliverable completion</p>
              </div>
              {isLeadership && (
                <button
                  onClick={() => setIsAddTaskModalOpen(true)}
                  className="px-3 py-1.5 bg-accent hover:bg-primary-light text-white text-xs font-semibold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Assign Task
                </button>
              )}
            </div>

            {tasks.length === 0 ? (
              <div className="text-center py-8 text-theme-text-secondary text-xs bg-theme-border/5 rounded-xl border border-theme-border/20">
                No tasks created specifically for this event yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs text-left">
                  <thead>
                    <tr className="text-theme-text-secondary border-b border-theme-border/40 text-xs">
                      <th className="pb-2.5 font-semibold">Task Deliverable</th>
                      <th className="pb-2.5 font-semibold">Assignee / Committee</th>
                      <th className="pb-2.5 font-semibold">Due Date</th>
                      <th className="pb-2.5 font-semibold">Status</th>
                      <th className="pb-2.5 font-semibold">Performance Rating</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-theme-border/20">
                    {tasks.map(t => (
                      <tr key={t.id} className="hover:bg-theme-border/10 transition-all text-xs">
                        <td className="py-3 font-semibold text-theme-text-primary">{t.title}</td>
                        <td className="py-3 text-theme-text-secondary">
                          <span className="font-medium text-theme-text-primary">{t.assignee}</span>
                          {t.eventCommitteeName && (
                            <span className="block text-[10px] text-theme-text-secondary">{t.eventCommitteeName}</span>
                          )}
                        </td>
                        <td className="py-3 text-theme-text-secondary whitespace-nowrap">{t.dueDate}</td>
                        <td className="py-3">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            t.status === 'Completed' ? 'bg-success/15 text-success' :
                            t.status === 'In Progress' ? 'bg-primary/15 text-primary-light' :
                            t.status === 'Pending Extension' ? 'bg-danger/15 text-danger' :
                            'bg-warning/15 text-warning'
                          }`}>
                            {t.status}
                          </span>
                        </td>
                        <td className="py-3">
                          {t.ratingScore ? (
                            <span className="inline-flex items-center gap-1 font-bold text-accent">
                              <Award className="h-3 w-3" />
                              {t.ratingScore.toFixed(1)}/5.0
                            </span>
                          ) : (
                            <span className="text-[10px] text-theme-text-secondary italic">Awaiting evaluation</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Section 2: Student Organizer Directory for this Event */}
          <div className="space-y-3 pt-4 border-t border-theme-border/20">
            <h3 className="text-sm font-bold text-theme-text-primary uppercase tracking-wider flex items-center gap-2">
              <Users className="h-4 w-4 text-warning" />
              Event Student Directory Roster ({eventParticipants.length})
            </h3>

            {eventParticipants.length === 0 ? (
              <div className="text-center py-6 text-theme-text-secondary text-xs">
                No students assigned to any committee for this event yet.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                {eventParticipants.map(member => (
                  <div key={member.id} className="p-2.5 bg-theme-border/10 border border-theme-border/20 rounded-xl flex items-center gap-2.5 text-xs">
                    <div className="h-7 w-7 bg-accent/20 rounded-lg flex items-center justify-center font-bold text-accent text-[10px]">
                      {member.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                    <div className="overflow-hidden">
                      <p className="font-semibold text-theme-text-primary truncate">{member.name}</p>
                      <p className="text-[10px] text-theme-text-secondary truncate">{member.division}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

      </div>

      {/* Modal 1: Add Committee to this Event */}
      {isAddCommitteeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="glass-panel w-full max-w-md rounded-3xl p-6 flex flex-col space-y-5 relative border border-white/15 shadow-2xl">
            <div>
              <h2 className="text-base font-bold text-theme-text-primary">Create Event Committee Unit</h2>
              <p className="text-xs text-theme-text-secondary mt-0.5">Define a sub-category committee specifically for {event.title}</p>
            </div>

            <form onSubmit={handleCreateCommittee} className="space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="block font-medium text-theme-text-secondary">Committee Name *</label>
                <input
                  type="text"
                  required
                  value={newCommitteeName}
                  onChange={(e) => setNewCommitteeName(e.target.value)}
                  placeholder="e.g. Stage & AV Committee, Hospitality Unit"
                  className="w-full px-4 py-2.5 bg-theme-background/30 border border-theme-card-border rounded-xl text-theme-text-primary focus:outline-none focus:border-accent"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddCommitteeModalOpen(false)}
                  className="px-4 py-2 bg-theme-border/30 hover:bg-theme-border/50 text-theme-text-primary font-semibold rounded-xl text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-accent hover:bg-primary-light text-white font-semibold rounded-xl text-xs shadow-md shadow-accent/15"
                >
                  Create Committee
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: Manage Committee Students */}
      {managingCommittee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="glass-panel w-full max-w-lg rounded-3xl p-6 flex flex-col space-y-4 relative border border-white/15 shadow-2xl max-h-[85vh]">
            <div>
              <h2 className="text-base font-bold text-theme-text-primary">Assign Students to {managingCommittee.name}</h2>
              <p className="text-xs text-theme-text-secondary mt-0.5">Select student organizers from Core Committee and Training Associates</p>
            </div>

            <div className="space-y-2 overflow-y-auto max-h-96 pr-1 divide-y divide-theme-border/20">
              {eligibleStudents.map(student => {
                const isSelected = selectedMemberIds.includes(student.id);
                return (
                  <div 
                    key={student.id}
                    onClick={() => handleToggleMember(student.id)}
                    className="flex items-center justify-between p-2.5 hover:bg-theme-border/10 rounded-xl cursor-pointer transition-all text-xs"
                  >
                    <div>
                      <p className="font-semibold text-theme-text-primary">{student.name}</p>
                      <p className="text-[10px] text-theme-text-secondary">{student.division} &middot; {student.email}</p>
                    </div>
                    <input 
                      type="checkbox" 
                      checked={isSelected}
                      onChange={() => {}}
                      className="h-4 w-4 accent-accent cursor-pointer"
                    />
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-theme-border/20">
              <button
                type="button"
                onClick={() => setManagingCommittee(null)}
                className="px-4 py-2 bg-theme-border/30 hover:bg-theme-border/50 text-theme-text-primary font-semibold rounded-xl text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveCommitteeMembers}
                className="px-4 py-2 bg-accent hover:bg-primary-light text-white font-semibold rounded-xl text-xs shadow-md shadow-accent/15"
              >
                Save Assignments ({selectedMemberIds.length} students)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 3: Assign Event Task */}
      {isAddTaskModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="glass-panel w-full max-w-lg rounded-3xl p-6 flex flex-col space-y-4 relative border border-white/15 shadow-2xl">
            <div>
              <h2 className="text-base font-bold text-theme-text-primary">Assign Event Task</h2>
              <p className="text-xs text-theme-text-secondary mt-0.5">Create a deliverable tied to {event.title}</p>
            </div>

            <form onSubmit={handleCreateTask} className="space-y-3.5 text-xs">
              <div className="space-y-1">
                <label className="block font-medium text-theme-text-secondary">Task Title *</label>
                <input
                  type="text"
                  required
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  placeholder="e.g. Procure 100 ID Badges and Lanyards"
                  className="w-full px-4 py-2 bg-theme-background/30 border border-theme-card-border rounded-xl text-theme-text-primary focus:outline-none focus:border-accent"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block font-medium text-theme-text-secondary">Event Committee</label>
                  <select
                    value={taskCommitteeId}
                    onChange={(e) => setTaskCommitteeId(e.target.value)}
                    className="w-full px-3 py-2 bg-theme-background/30 border border-theme-card-border rounded-xl text-theme-text-primary focus:outline-none focus:border-accent"
                  >
                    <option value="">General Event Task</option>
                    {event.committees.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="block font-medium text-theme-text-secondary">Assignee Student</label>
                  <select
                    value={taskAssigneeId}
                    onChange={(e) => setTaskAssigneeId(e.target.value)}
                    className="w-full px-3 py-2 bg-theme-background/30 border border-theme-card-border rounded-xl text-theme-text-primary focus:outline-none focus:border-accent"
                  >
                    <option value="">Select individual assignee...</option>
                    {eventParticipants.map(p => (
                      <option key={p.id} value={p.id}>{p.name} ({p.division})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="block font-medium text-theme-text-secondary">Due Date *</label>
                <input
                  type="date"
                  required
                  value={taskDueDate}
                  onChange={(e) => setTaskDueDate(e.target.value)}
                  className="w-full px-4 py-2 bg-theme-background/30 border border-theme-card-border rounded-xl text-theme-text-primary focus:outline-none focus:border-accent"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddTaskModalOpen(false)}
                  className="px-4 py-2 bg-theme-border/30 hover:bg-theme-border/50 text-theme-text-primary font-semibold rounded-xl text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-accent hover:bg-primary-light text-white font-semibold rounded-xl text-xs shadow-md shadow-accent/15"
                >
                  Assign Task
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Committee Modal */}
      <ConfirmModal
        isOpen={Boolean(deletingCommitteeId)}
        title="Remove Event Committee"
        message="Are you sure you want to remove this committee from the event? Student assignments for this committee will be detached."
        confirmLabel="Remove Committee"
        variant="danger"
        onConfirm={handleConfirmDeleteCommittee}
        onCancel={() => setDeletingCommitteeId(null)}
      />

      {/* Student Profile Modal */}
      <StudentProfileModal
        memberIdOrName={selectedStudentForProfile}
        onClose={() => setSelectedStudentForProfile(null)}
      />

    </div>
  );
}
