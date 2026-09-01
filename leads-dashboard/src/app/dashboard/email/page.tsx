'use client';

import React, { useState, useEffect } from 'react';
import { 
  Mail, 
  Server, 
  Send, 
  CheckCircle2, 
  AlertCircle, 
  Lock, 
  ShieldAlert, 
  Eye, 
  EyeOff, 
  RefreshCw,
  FileText,
  Sparkles,
  Key,
  Globe,
  Search,
  X,
  Check,
  Zap,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  Rocket,
  Clock,
  Inbox,
  Play,
  Filter
} from 'lucide-react';
import { EmailSettings, EmailLog } from '@/lib/email-service';
import { canManageEmailSettings } from '@/lib/permissions';
import { ConfirmModal } from '@/components/ui/confirm-modal';
import { EmptyState } from '@/components/ui/empty-state';

interface PendingQueueItem {
  email: string;
  assigneeName: string;
  taskCount: number;
  tasks: Array<{
    id: string;
    title: string;
    event?: string;
    dueDate?: string;
    creatorName?: string;
    assignedAt: string;
  }>;
}

export default function EmailManagementPage() {
  const [user, setUser] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'outbox' | 'queue' | 'composer' | 'settings'>('outbox');

  // Email Settings Form State
  const [settings, setSettings] = useState<EmailSettings>({
    id: 'default',
    provider: 'gmail',
    smtpHost: 'smtp.gmail.com',
    smtpPort: 587,
    secure: false,
    authUser: 'leads@msruas.ac.in',
    authPass: '',
    fromName: 'LEADS Next Gen Centre',
    fromEmail: 'leads@msruas.ac.in',
    replyTo: 'leads@msruas.ac.in',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [showDkimSection, setShowDkimSection] = useState(false);

  // SMTP Test Diagnostics State
  const [testRecipient, setTestRecipient] = useState('');
  const [isTestingSmtp, setIsTestingSmtp] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Email Client Composer State
  const [dispatchScope, setDispatchScope] = useState<'SINGLE' | 'All Members' | 'Advisory Board' | 'Core Committee' | 'Training Associate' | 'Alumni'>('SINGLE');
  const [customRecipient, setCustomRecipient] = useState('');
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState<'ANNOUNCEMENT' | 'DIRECT_MESSAGE' | 'SYSTEM'>('ANNOUNCEMENT');
  const [bodyText, setBodyText] = useState('');
  const [previewTab, setPreviewTab] = useState<'edit' | 'preview'>('edit');
  const [isSendingDispatch, setIsSendingDispatch] = useState(false);
  const [showDispatchConfirm, setShowDispatchConfirm] = useState(false);

  // Outbox & Audit Logs State
  const [outboxLogs, setOutboxLogs] = useState<EmailLog[]>([]);
  const [logSearchQuery, setLogSearchQuery] = useState('');
  const [logStatusFilter, setLogStatusFilter] = useState<'ALL' | 'SENT' | 'FAILED'>('ALL');
  const [logCategoryFilter, setLogCategoryFilter] = useState<string>('ALL');
  const [selectedLog, setSelectedLog] = useState<EmailLog | null>(null);

  // Pending Buffer Queues State
  const [pendingQueues, setPendingQueues] = useState<PendingQueueItem[]>([]);
  const [isFlushingQueue, setIsFlushingQueue] = useState<string | null>(null);

  // Toast notifications
  const [toastMsg, setToastMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    const savedUser = localStorage.getItem('user');
    if (savedUser) {
      try {
        const u = JSON.parse(savedUser);
        setUser(u);
        setTestRecipient(u.email || 'leads@msruas.ac.in');
      } catch (e) {
        console.error(e);
      }
    }
    fetchSettings();
    fetchLogs();
    fetchQueues();
  }, []);

  const triggerToast = (type: 'success' | 'error', text: string) => {
    setToastMsg({ type, text });
    setTimeout(() => setToastMsg(null), 4500);
  };

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/email/settings');
      if (res.ok) {
        const data = await res.json();
        setSettings(data);
        if (data.dkimPrivateKey) setShowDkimSection(true);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchLogs = async () => {
    try {
      const res = await fetch('/api/email/logs');
      if (res.ok) {
        const data = await res.json();
        setOutboxLogs(data || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchQueues = async () => {
    try {
      const res = await fetch('/api/email/queue');
      if (res.ok) {
        const data = await res.json();
        setPendingQueues(data.queues || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const [isCancellingQueue, setIsCancellingQueue] = useState<string | null>(null);

  const handleCancelQueue = async (email?: string) => {
    setIsCancellingQueue(email || 'ALL');
    try {
      const url = email ? `/api/email/queue?email=${encodeURIComponent(email)}` : '/api/email/queue?all=true';
      const res = await fetch(url, { method: 'DELETE' });
      if (res.ok) {
        const data = await res.json();
        triggerToast('success', data.message || 'Queued email buffer cancelled.');
        fetchQueues();
      } else {
        triggerToast('error', 'Failed to cancel queue.');
      }
    } catch (err: any) {
      triggerToast('error', err?.message || 'Error cancelling queue');
    } finally {
      setIsCancellingQueue(null);
    }
  };

  const handleFlushQueue = async (email: string) => {
    setIsFlushingQueue(email);
    try {
      const res = await fetch('/api/email/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (res.ok) {
        triggerToast('success', `Flushed and dispatched task digest email to ${email}`);
        fetchQueues();
        fetchLogs();
      } else {
        triggerToast('error', 'Failed to flush queue.');
      }
    } catch (err: any) {
      triggerToast('error', err?.message || 'Error flushing queue');
    } finally {
      setIsFlushingQueue(null);
    }
  };

  // Provider Preset Handler
  const handleSelectProvider = (provider: EmailSettings['provider']) => {
    if (provider === 'gmail') {
      setSettings(prev => ({
        ...prev,
        provider: 'gmail',
        smtpHost: 'smtp.gmail.com',
        smtpPort: 587,
        secure: false,
      }));
    } else if (provider === 'outlook') {
      setSettings(prev => ({
        ...prev,
        provider: 'outlook',
        smtpHost: 'smtp.office365.com',
        smtpPort: 587,
        secure: false,
      }));
    } else if (provider === 'local_postfix') {
      setSettings(prev => ({
        ...prev,
        provider: 'local_postfix',
        smtpHost: 'localhost',
        smtpPort: 25,
        secure: false,
      }));
    } else if (provider === 'direct_send') {
      setSettings(prev => ({
        ...prev,
        provider: 'direct_send',
      }));
    } else {
      setSettings(prev => ({
        ...prev,
        provider: 'custom',
      }));
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingSettings(true);
    try {
      const res = await fetch('/api/email/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings, actorName: user?.name || 'Super User' }),
      });
      if (res.ok) {
        const updated = await res.json();
        setSettings(updated);
        triggerToast('success', 'Email server credentials and SMTP settings updated successfully.');
      } else {
        const data = await res.json().catch(() => null);
        triggerToast('error', data?.error || 'Failed to save email settings.');
      }
    } catch (err: any) {
      triggerToast('error', err?.message || 'Error saving settings.');
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleTestConnection = async () => {
    if (!testRecipient) {
      triggerToast('error', 'Please enter a test recipient email address.');
      return;
    }
    setIsTestingSmtp(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/email/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Test whatever is currently in the form — including a provider
        // switch or credentials that haven't been saved yet — not whatever
        // was last saved. Otherwise switching providers here and testing
        // silently re-tests the old saved config with no way to tell.
        body: JSON.stringify({ testRecipient, settings }),
      });
      const data = await res.json();
      setTestResult(data);
      if (data.success) {
        triggerToast('success', 'SMTP test successful! Check test inbox.');
      } else {
        triggerToast('error', 'SMTP test failed. Check server credentials.');
      }
      fetchLogs();
    } catch (err: any) {
      setTestResult({ success: false, message: err?.message || 'Connection test failed' });
      triggerToast('error', 'Failed to reach SMTP server.');
    } finally {
      setIsTestingSmtp(false);
    }
  };

  const [badgeOption, setBadgeOption] = useState<string>('NONE');
  const [customBadgeText, setCustomBadgeText] = useState<string>('');

  const handleExecuteDispatch = async () => {
    setShowDispatchConfirm(false);
    setIsSendingDispatch(true);
    try {
      let resolvedBadgeText: string | undefined = undefined;
      if (badgeOption === 'INVITATION') resolvedBadgeText = '🎉 Official Invitation';
      else if (badgeOption === 'ANNOUNCEMENT') resolvedBadgeText = '📢 Official Announcement';
      else if (badgeOption === 'ACTION_REQUIRED') resolvedBadgeText = '📌 Action Required';
      else if (badgeOption === 'IMPORTANT') resolvedBadgeText = '⚠️ Important Notice';
      else if (badgeOption === 'CUSTOM') resolvedBadgeText = customBadgeText.trim() || undefined;
      else resolvedBadgeText = undefined;

      const payload = {
        scope: dispatchScope,
        recipientEmail: dispatchScope === 'SINGLE' ? customRecipient : undefined,
        subject,
        bodyText,
        category,
        badgeText: resolvedBadgeText,
      };
      const res = await fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        triggerToast('success', `Dispatched ${data.count} email notification(s) successfully.`);
        setSubject('');
        setBodyText('');
        setCustomRecipient('');
        fetchLogs();
      } else {
        triggerToast('error', data.error || 'Failed to dispatch emails.');
      }
    } catch (err: any) {
      triggerToast('error', err?.message || 'Error executing email dispatch.');
    } finally {
      setIsSendingDispatch(false);
    }
  };

  // Filter Outbox Logs
  const filteredLogs = outboxLogs.filter(log => {
    if (logStatusFilter !== 'ALL' && log.status !== logStatusFilter) return false;
    if (logCategoryFilter !== 'ALL' && log.category !== logCategoryFilter) return false;
    const q = logSearchQuery.toLowerCase();
    return !q || log.to.toLowerCase().includes(q) || log.subject.toLowerCase().includes(q) || log.category.toLowerCase().includes(q);
  });

  const totalLogs = outboxLogs.length;
  const sentCount = outboxLogs.filter(l => l.status === 'SENT').length;
  const failedCount = outboxLogs.filter(l => l.status === 'FAILED').length;

  const isSuperUser = user && (user.tier === 1 || user.role === 'Super User' || user.id === 'm1' || user.email?.toLowerCase() === 'kayo2970@gmail.com');

  // Access Guard — Centre Head / Super User, or an explicit Group Policy grant
  const isAuthorized = user && canManageEmailSettings(user);

  if (user && !isAuthorized) {
    return (
      <div className="p-8 max-w-2xl mx-auto">
        <div className="glass-panel p-8 rounded-3xl border border-danger/30 text-center space-y-4 shadow-2xl">
          <div className="h-16 w-16 bg-danger/15 rounded-2xl flex items-center justify-center mx-auto text-danger border border-danger/25">
            <Lock className="h-8 w-8" />
          </div>
          <h2 className="text-xl font-bold text-theme-text-primary">Centre Head Access Only</h2>
          <p className="text-xs text-theme-text-secondary leading-relaxed">
            The Mailroom Audit Portal handles global SMTP server configurations, outbox delivery logs, dispatch queues, and system transmission histories. Access is strictly restricted to the Centre Head.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 space-y-6">
      
      {/* Toast Alert */}
      {toastMsg && (
        <div className={`p-4 rounded-2xl text-xs font-semibold flex items-center gap-3 animate-in fade-in duration-300 border shadow-lg ${
          toastMsg.type === 'success' 
            ? 'bg-success/15 border-success/30 text-theme-text-primary' 
            : 'bg-danger/15 border-danger/30 text-theme-text-primary'
        }`}>
          {toastMsg.type === 'success' ? <CheckCircle2 className="h-5 w-5 text-success shrink-0" /> : <AlertCircle className="h-5 w-5 text-danger shrink-0" />}
          <span>{toastMsg.text}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className="glass-panel p-6 rounded-3xl border border-accent/20 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-gradient-to-r from-accent/10 via-primary/5 to-transparent">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-accent/15 text-accent border border-accent/20">
              <Mail className="h-5 w-5" />
            </div>
            <h1 className="text-xl font-bold text-theme-text-primary">Centre Head Operational Mailbox & Audit Desk</h1>
          </div>
          <p className="text-xs text-theme-text-secondary">
            View outbox dispatch histories, inspect pending email queues, compose broadcasts, and monitor operational delivery.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold px-3 py-1 bg-accent/15 text-accent rounded-xl border border-accent/20 flex items-center gap-1.5">
            <Server className="h-3.5 w-3.5" />
            SMTP Relay: {settings.provider.toUpperCase()}
          </span>
        </div>
      </div>

      {/* Mailbox Suite Tab Navigation */}
      <div className="flex items-center gap-2 border-b border-theme-border/30 pb-3 text-xs font-semibold overflow-x-auto">
        <button
          onClick={() => setActiveTab('outbox')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all cursor-pointer ${
            activeTab === 'outbox' 
              ? 'bg-accent text-white shadow-md shadow-accent/20' 
              : 'text-theme-text-secondary hover:bg-theme-border/20'
          }`}
        >
          <Inbox className="h-4 w-4" />
          Sent Outbox & Delivery Audit ({totalLogs})
        </button>

        <button
          onClick={() => {
            setActiveTab('queue');
            fetchQueues();
          }}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all cursor-pointer relative ${
            activeTab === 'queue' 
              ? 'bg-accent text-white shadow-md shadow-accent/20' 
              : 'text-theme-text-secondary hover:bg-theme-border/20'
          }`}
        >
          <Clock className="h-4 w-4" />
          Sending Queue & Buffers ({pendingQueues.length})
          {pendingQueues.length > 0 && (
            <span className="h-2 w-2 rounded-full bg-amber-400 animate-ping absolute top-1 right-1" />
          )}
        </button>

        <button
          onClick={() => setActiveTab('composer')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all cursor-pointer ${
            activeTab === 'composer' 
              ? 'bg-accent text-white shadow-md shadow-accent/20' 
              : 'text-theme-text-secondary hover:bg-theme-border/20'
          }`}
        >
          <Send className="h-4 w-4" />
          Compose Broadcast
        </button>

        {isSuperUser && (
          <button
            onClick={() => setActiveTab('settings')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all cursor-pointer ${
              activeTab === 'settings' 
                ? 'bg-accent text-white shadow-md shadow-accent/20' 
                : 'text-theme-text-secondary hover:bg-theme-border/20'
            }`}
          >
            <Server className="h-4 w-4" />
            SMTP Configuration
          </button>
        )}
      </div>

      {/* TAB 1: SENT OUTBOX & DELIVERY AUDIT LOGS */}
      {activeTab === 'outbox' && (
        <div className="glass-panel p-6 rounded-3xl space-y-5 border border-theme-card-border">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-bold text-theme-text-primary flex items-center gap-2">
                <FileText className="h-4 w-4 text-accent" />
                Sent Email History & Operational Audit Logs
              </h3>
              <p className="text-xs text-theme-text-secondary">Comprehensive history of every email notification, OTP, task digest, and announcement dispatched.</p>
            </div>

            <button
              onClick={fetchLogs}
              className="px-3 py-1.5 bg-theme-border/20 hover:bg-theme-border/40 text-theme-text-primary text-xs font-semibold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shrink-0"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh Outbox Logs
            </button>
          </div>

          {/* Outbox Metrics Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 bg-theme-border/10 rounded-2xl border border-theme-border/20 space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-theme-text-secondary">Total Sent Emails</span>
              <h4 className="text-2xl font-bold text-theme-text-primary">{totalLogs}</h4>
            </div>

            <div className="p-4 bg-success/10 rounded-2xl border border-success/20 space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-success">Successful Handshakes</span>
              <h4 className="text-2xl font-bold text-success">{sentCount}</h4>
            </div>

            <div className="p-4 bg-danger/10 rounded-2xl border border-danger/20 space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-danger">Delivery Failures</span>
              <h4 className="text-2xl font-bold text-danger">{failedCount}</h4>
            </div>
          </div>

          {/* Filters & Search */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-theme-text-secondary" />
              <input
                type="text"
                value={logSearchQuery}
                onChange={e => setLogSearchQuery(e.target.value)}
                placeholder="Search recipient email, subject line, category..."
                className="w-full pl-9 pr-3 py-2 bg-theme-background/40 border border-theme-card-border rounded-xl text-xs text-theme-text-primary focus:outline-none focus:border-accent"
              />
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <Filter className="h-3.5 w-3.5 text-theme-text-secondary shrink-0" />
                <select
                  value={logStatusFilter}
                  onChange={e => setLogStatusFilter(e.target.value as any)}
                  className="px-3 py-1.5 bg-theme-background/40 border border-theme-card-border rounded-xl text-xs text-theme-text-primary focus:outline-none"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="SENT">Sent Successfully</option>
                  <option value="FAILED">Delivery Failed</option>
                </select>
              </div>

              <select
                value={logCategoryFilter}
                onChange={e => setLogCategoryFilter(e.target.value)}
                className="px-3 py-1.5 bg-theme-background/40 border border-theme-card-border rounded-xl text-xs text-theme-text-primary focus:outline-none"
              >
                <option value="ALL">All Categories</option>
                <option value="ANNOUNCEMENT">Announcements</option>
                <option value="DIRECT_MESSAGE">Direct Messages</option>
                <option value="SYSTEM">System Broadcasts</option>
              </select>
            </div>
          </div>

          {/* Logs Table */}
          {filteredLogs.length === 0 ? (
            <EmptyState
              icon={Mail}
              title="No email logs found"
              description="Dispatched emails and server delivery records will appear here."
            />
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-theme-border/20">
              <table className="w-full text-left text-xs text-theme-text-primary">
                <thead className="bg-theme-border/15 text-[11px] uppercase tracking-wider text-theme-text-secondary border-b border-theme-border/20">
                  <tr>
                    <th className="p-3.5 font-bold">Status</th>
                    <th className="p-3.5 font-bold">Recipient Email</th>
                    <th className="p-3.5 font-bold">Subject Line</th>
                    <th className="p-3.5 font-bold">Category</th>
                    <th className="p-3.5 font-bold">Dispatched Date</th>
                    <th className="p-3.5 font-bold text-right">Inspect Payload</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-theme-border/15">
                  {filteredLogs.map(log => (
                    <tr key={log.id} className="hover:bg-theme-border/10 transition-colors">
                      <td className="p-3.5">
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                          log.status === 'SENT' 
                            ? 'bg-success/15 text-success border border-success/20' 
                            : 'bg-danger/15 text-danger border border-danger/20'
                        }`}>
                          {log.status === 'SENT' ? 'DELIVERED / SENT' : 'FAILED'}
                        </span>
                      </td>
                      <td className="p-3.5 font-semibold text-theme-text-primary">{log.to}</td>
                      <td className="p-3.5 max-w-xs truncate font-medium">{log.subject}</td>
                      <td className="p-3.5">
                        <span className="px-2 py-0.5 bg-accent/10 text-accent rounded-md font-mono text-[10px]">
                          {log.category}
                        </span>
                      </td>
                      <td className="p-3.5 text-theme-text-secondary text-[11px] whitespace-nowrap">
                        {new Date(log.sentAt).toLocaleString()}
                      </td>
                      <td className="p-3.5 text-right">
                        <button
                          onClick={() => setSelectedLog(log)}
                          className="px-2.5 py-1 bg-accent/15 hover:bg-accent/25 text-accent text-[11px] font-bold rounded-lg border border-accent/20 transition-all cursor-pointer"
                        >
                          Inspect Payload
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: SENDING QUEUE & BUFFERS */}
      {activeTab === 'queue' && (
        <div className="glass-panel p-6 rounded-3xl space-y-5 border border-theme-card-border">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-bold text-theme-text-primary flex items-center gap-2">
                <Clock className="h-4 w-4 text-accent" />
                Active Sending Queues & Debounced Buffers
              </h3>
              <p className="text-xs text-theme-text-secondary">Inspect task assignment digest queues currently held in the 10-minute quiet buffer before dispatch.</p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {pendingQueues.length > 0 && (
                <button
                  onClick={() => handleCancelQueue()}
                  disabled={Boolean(isCancellingQueue)}
                  className="px-3 py-1.5 bg-danger/15 hover:bg-danger/25 text-danger border border-danger/30 text-xs font-semibold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shrink-0 disabled:opacity-50"
                >
                  <X className="h-3.5 w-3.5" />
                  Cancel All Queues
                </button>
              )}

              <button
                onClick={fetchQueues}
                className="px-3 py-1.5 bg-theme-border/20 hover:bg-theme-border/40 text-theme-text-primary text-xs font-semibold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shrink-0"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Refresh Queues
              </button>
            </div>
          </div>

          {pendingQueues.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title="No pending email queues"
              description="All task assignment digests and notifications have been flushed and dispatched."
            />
          ) : (
            <div className="space-y-4">
              {pendingQueues.map(q => (
                <div key={q.email} className="p-5 bg-theme-background/30 border border-theme-card-border rounded-2xl space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-theme-border/20 pb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-theme-text-primary">{q.assigneeName}</span>
                        <span className="text-xs text-accent font-mono">({q.email})</span>
                      </div>
                      <span className="text-[10px] text-amber-400 font-semibold flex items-center gap-1 mt-1">
                        <Clock className="h-3 w-3" /> 10-Minute Buffer Active ({q.taskCount} queued task notifications)
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => handleCancelQueue(q.email)}
                        disabled={isCancellingQueue === q.email}
                        className="px-3 py-2 bg-danger/15 hover:bg-danger/25 text-danger border border-danger/30 text-xs font-bold rounded-xl transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1 shrink-0"
                      >
                        <X className="h-3.5 w-3.5" />
                        {isCancellingQueue === q.email ? 'Cancelling...' : 'Cancel Queue'}
                      </button>

                      <button
                        onClick={() => handleFlushQueue(q.email)}
                        disabled={isFlushingQueue === q.email}
                        className="px-4 py-2 bg-accent hover:bg-primary-light text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-accent/20 cursor-pointer disabled:opacity-50 flex items-center gap-1.5 shrink-0"
                      >
                        <Play className="h-3.5 w-3.5" />
                        {isFlushingQueue === q.email ? 'Flushing Email...' : 'Dispatch Digest Now'}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <span className="text-[11px] font-bold text-theme-text-secondary block">Queued Tasks in Digest Payload:</span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {q.tasks.map(t => (
                        <div key={t.id} className="p-2.5 bg-theme-background/60 rounded-xl border border-theme-border/20 text-xs">
                          <span className="font-bold text-theme-text-primary block">{t.title}</span>
                          <span className="text-[10px] text-theme-text-secondary block">Context: {t.event || 'LEADS Operations'} &middot; Due: {t.dueDate}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: COMPOSE BROADCAST */}
      {activeTab === 'composer' && (
        <div className="glass-panel p-6 md:p-8 rounded-3xl space-y-6 border border-theme-card-border">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-theme-border/20 pb-4">
            <div>
              <h3 className="text-base font-bold text-theme-text-primary flex items-center gap-2">
                <Send className="h-4 w-4 text-accent" />
                Broadcast Email Composer
              </h3>
              <p className="text-xs text-theme-text-secondary mt-0.5">
                Compose custom HTML/text email broadcasts to member divisions or individual recipients directly via your configured mail server.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPreviewTab('edit')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold cursor-pointer transition-all ${
                  previewTab === 'edit' ? 'bg-accent text-white' : 'bg-theme-border/20 text-theme-text-secondary'
                }`}
              >
                Edit Content
              </button>
              <button
                type="button"
                onClick={() => setPreviewTab('preview')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold cursor-pointer transition-all ${
                  previewTab === 'preview' ? 'bg-accent text-white' : 'bg-theme-border/20 text-theme-text-secondary'
                }`}
              >
                Live Preview
              </button>
            </div>
          </div>

          {previewTab === 'edit' ? (
            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="block font-medium text-theme-text-secondary">Target Recipient Scope *</label>
                  <select
                    value={dispatchScope}
                    onChange={e => setDispatchScope(e.target.value as any)}
                    className="w-full px-4 py-2.5 bg-theme-background/40 border border-theme-card-border rounded-xl text-theme-text-primary focus:outline-none focus:border-accent font-semibold"
                  >
                    <option value="SINGLE">Single Recipient Email</option>
                    <option value="All Members">All Members (Full Roster Broadcast)</option>
                    <option value="Core Committee">Core Committee</option>
                    <option value="Training Associate">Training Associates</option>
                    <option value="Advisory Board">Advisory Board</option>
                    <option value="Alumni">Alumni Roster</option>
                  </select>
                </div>

                {dispatchScope === 'SINGLE' ? (
                  <div className="space-y-1.5 sm:col-span-2">
                    <label className="block font-medium text-theme-text-secondary">Recipient Email Address *</label>
                    <input
                      type="email"
                      required
                      value={customRecipient}
                      onChange={e => setCustomRecipient(e.target.value)}
                      placeholder="student@msruas.ac.in"
                      className="w-full px-4 py-2.5 bg-theme-background/40 border border-theme-card-border rounded-xl text-theme-text-primary focus:outline-none focus:border-accent"
                    />
                  </div>
                ) : (
                  <div className="space-y-1.5 sm:col-span-2">
                    <label className="block font-medium text-theme-text-secondary">Category Tag</label>
                    <select
                      value={category}
                      onChange={e => setCategory(e.target.value as any)}
                      className="w-full px-4 py-2.5 bg-theme-background/40 border border-theme-card-border rounded-xl text-theme-text-primary focus:outline-none focus:border-accent"
                    >
                      <option value="ANNOUNCEMENT">Announcement Broadcast</option>
                      <option value="DIRECT_MESSAGE">Direct Notification</option>
                      <option value="SYSTEM">System Broadcast</option>
                    </select>
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="block font-medium text-theme-text-secondary">Subject Line *</label>
                <input
                  type="text"
                  required
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  placeholder="e.g. [LEADS Announcement] General Body Meeting Schedule & Deliverables"
                  className="w-full px-4 py-2.5 bg-theme-background/40 border border-theme-card-border rounded-xl text-theme-text-primary focus:outline-none focus:border-accent font-semibold"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block font-medium text-theme-text-secondary">Email Message Body *</label>
                <textarea
                  rows={8}
                  required
                  value={bodyText}
                  onChange={e => setBodyText(e.target.value)}
                  placeholder="Type message content here..."
                  className="w-full px-4 py-3 bg-theme-background/40 border border-theme-card-border rounded-xl text-theme-text-primary focus:outline-none focus:border-accent font-mono text-xs leading-relaxed"
                />
              </div>

              <div className="flex items-center justify-end pt-3">
                <button
                  type="button"
                  disabled={!subject || !bodyText || (dispatchScope === 'SINGLE' && !customRecipient) || isSendingDispatch}
                  onClick={() => setShowDispatchConfirm(true)}
                  className="px-6 py-2.5 bg-accent hover:bg-primary-light text-white font-bold rounded-xl transition-all shadow-md shadow-accent/20 cursor-pointer disabled:opacity-50 flex items-center gap-2"
                >
                  <Send className="h-4 w-4" />
                  {isSendingDispatch ? 'Dispatching...' : 'Broadcast Email Payload'}
                </button>
              </div>
            </div>
          ) : (
            /* Live HTML Preview Box */
            <div className="space-y-4">
              <div className="p-4 bg-theme-background/60 border border-theme-card-border rounded-2xl space-y-3">
                <div className="border-b border-theme-border/20 pb-3 text-xs space-y-1">
                  <p className="text-theme-text-secondary">From: <strong className="text-theme-text-primary">{settings.fromName} &lt;{settings.fromEmail}&gt;</strong></p>
                  <p className="text-theme-text-secondary">To: <strong className="text-theme-text-primary">{dispatchScope === 'SINGLE' ? customRecipient || 'recipient@domain.com' : `[Broadcast Scope: ${dispatchScope}]`}</strong></p>
                  <p className="text-theme-text-secondary">Subject: <strong className="text-accent">{subject || 'No Subject Provided'}</strong></p>
                </div>
                
                <div className="p-6 bg-slate-900 text-slate-100 rounded-xl border border-slate-800 space-y-4 text-xs font-sans">
                  <div className="border-b border-slate-800 pb-3">
                    <h3 className="text-lg font-bold text-sky-400">{subject || 'Subject Line Preview'}</h3>
                    <p className="text-[11px] text-slate-400 mt-1">Sender: {settings.fromName}</p>
                  </div>
                  <div className="whitespace-pre-wrap leading-relaxed text-slate-200">
                    {bodyText || 'Your message text will appear here...'}
                  </div>
                  <div className="border-t border-slate-800 pt-3 text-[10px] text-slate-500 text-center">
                    © 2026 {settings.fromName} &middot; MSRUAS Internal Operations Portal
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: SMTP SERVER SETTINGS */}
      {activeTab === 'settings' && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="glass-panel p-6 rounded-3xl xl:col-span-2 space-y-6 border border-theme-card-border">
            <div>
              <h3 className="text-base font-bold text-theme-text-primary flex items-center gap-2">
                <Key className="h-4 w-4 text-accent" />
                SMTP Mail Relay Credentials
              </h3>
              <p className="text-xs text-theme-text-secondary mt-0.5">
                Select your service provider or enter custom SMTP credentials for sending announcements, OTPs, and task notifications.
              </p>
            </div>

            {/* Provider Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <button
                type="button"
                onClick={() => handleSelectProvider('gmail')}
                className={`p-3.5 rounded-2xl border text-left flex flex-col justify-between transition-all cursor-pointer ${
                  settings.provider === 'gmail'
                    ? 'bg-accent/15 border-accent text-accent shadow-md shadow-accent/10'
                    : 'bg-theme-border/10 border-theme-border/30 hover:border-theme-border/60 text-theme-text-primary'
                }`}
              >
                <div className="flex items-center justify-between">
                  <Globe className="h-4 w-4" />
                  {settings.provider === 'gmail' && <Check className="h-4 w-4" />}
                </div>
                <div>
                  <span className="font-bold text-xs block mt-2">Gmail / Workspace</span>
                  <span className="text-[10px] opacity-75">smtp.gmail.com:587</span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleSelectProvider('outlook')}
                className={`p-3.5 rounded-2xl border text-left flex flex-col justify-between transition-all cursor-pointer ${
                  settings.provider === 'outlook'
                    ? 'bg-accent/15 border-accent text-accent shadow-md shadow-accent/10'
                    : 'bg-theme-border/10 border-theme-border/30 hover:border-theme-border/60 text-theme-text-primary'
                }`}
              >
                <div className="flex items-center justify-between">
                  <Globe className="h-4 w-4" />
                  {settings.provider === 'outlook' && <Check className="h-4 w-4" />}
                </div>
                <div>
                  <span className="font-bold text-xs block mt-2">Outlook 365</span>
                  <span className="text-[10px] opacity-75">smtp.office365.com:587</span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleSelectProvider('custom')}
                className={`p-3.5 rounded-2xl border text-left flex flex-col justify-between transition-all cursor-pointer ${
                  settings.provider === 'custom'
                    ? 'bg-accent/15 border-accent text-accent shadow-md shadow-accent/10'
                    : 'bg-theme-border/10 border-theme-border/30 hover:border-theme-border/60 text-theme-text-primary'
                }`}
              >
                <div className="flex items-center justify-between">
                  <Server className="h-4 w-4" />
                  {settings.provider === 'custom' && <Check className="h-4 w-4" />}
                </div>
                <div>
                  <span className="font-bold text-xs block mt-2">Custom SMTP</span>
                  <span className="text-[10px] opacity-75">Host & Port Defined</span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleSelectProvider('local_postfix')}
                className={`p-3.5 rounded-2xl border text-left flex flex-col justify-between transition-all cursor-pointer ${
                  settings.provider === 'local_postfix'
                    ? 'bg-accent/15 border-accent text-accent shadow-md shadow-accent/10'
                    : 'bg-theme-border/10 border-theme-border/30 hover:border-theme-border/60 text-theme-text-primary'
                }`}
              >
                <div className="flex items-center justify-between">
                  <Zap className="h-4 w-4" />
                  {settings.provider === 'local_postfix' && <Check className="h-4 w-4" />}
                </div>
                <div>
                  <span className="font-bold text-xs block mt-2">Local Postfix</span>
                  <span className="text-[10px] opacity-75">localhost:25</span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleSelectProvider('direct_send')}
                className={`p-3.5 rounded-2xl border text-left flex flex-col justify-between transition-all cursor-pointer ${
                  settings.provider === 'direct_send'
                    ? 'bg-accent/15 border-accent text-accent shadow-md shadow-accent/10'
                    : 'bg-theme-border/10 border-theme-border/30 hover:border-theme-border/60 text-theme-text-primary'
                }`}
              >
                <div className="flex items-center justify-between">
                  <Rocket className="h-4 w-4" />
                  {settings.provider === 'direct_send' && <Check className="h-4 w-4" />}
                </div>
                <div>
                  <span className="font-bold text-xs block mt-2">Direct Send (Built-in)</span>
                  <span className="text-[10px] opacity-75">No relay — MX direct</span>
                </div>
              </button>
            </div>

            <form
              onSubmit={handleSaveSettings}
              onInvalidCapture={(e) => {
                const target = e.target as HTMLInputElement;
                target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                const labelEl = target.closest('.space-y-1\\.5')?.querySelector('label');
                const label = labelEl?.textContent?.replace(/\s*\*\s*$/, '') || 'A required field';
                triggerToast('error', `${label} is empty or invalid — scroll up to fix it before saving.`);
              }}
              className="space-y-4 text-xs"
            >
              {settings.provider === 'direct_send' ? (
                <div className="space-y-3">
                  <div className="p-4 bg-accent/10 rounded-2xl border border-accent/20 space-y-2 text-[11px] text-theme-text-secondary leading-relaxed">
                    <span className="font-bold text-theme-text-primary flex items-center gap-1.5">
                      <Rocket className="h-3.5 w-3.5 text-accent" />
                      Built-in Direct Send
                    </span>
                    <p>The app itself resolves each recipient&apos;s mail server (MX record) and delivers straight to it — no Gmail/Outlook relay, no Postfix, nothing in between.</p>
                  </div>
                  <div className="space-y-1.5">
                    <label className="block font-medium text-theme-text-secondary">HELO Hostname *</label>
                    <input
                      type="text"
                      required
                      value={settings.heloHostname || ''}
                      onChange={e => setSettings(prev => ({ ...prev, heloHostname: e.target.value }))}
                      placeholder="e.g. mail.leadsnextgencentre.online"
                      className="w-full px-4 py-2.5 bg-theme-background/40 border border-theme-card-border rounded-xl text-theme-text-primary focus:outline-none focus:border-accent"
                    />
                    <p className="text-[11px] text-theme-text-secondary">Must match the PTR (reverse-DNS) record on this VPS&apos;s outbound IP, or most receiving mail servers will reject the connection outright.</p>
                  </div>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="space-y-1.5 sm:col-span-2">
                      <label className="block font-medium text-theme-text-secondary">SMTP Host *</label>
                      <input
                        type="text"
                        required
                        value={settings.smtpHost}
                        onChange={e => setSettings(prev => ({ ...prev, smtpHost: e.target.value }))}
                        placeholder="e.g. smtp.gmail.com"
                        className="w-full px-4 py-2.5 bg-theme-background/40 border border-theme-card-border rounded-xl text-theme-text-primary focus:outline-none focus:border-accent"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="block font-medium text-theme-text-secondary">SMTP Port *</label>
                      <input
                        type="number"
                        required
                        value={settings.smtpPort}
                        onChange={e => setSettings(prev => ({ ...prev, smtpPort: Number(e.target.value) }))}
                        placeholder="587"
                        className="w-full px-4 py-2.5 bg-theme-background/40 border border-theme-card-border rounded-xl text-theme-text-primary focus:outline-none focus:border-accent"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="block font-medium text-theme-text-secondary">Auth Username / Email</label>
                      <input
                        type="text"
                        value={settings.authUser}
                        onChange={e => setSettings(prev => ({ ...prev, authUser: e.target.value }))}
                        placeholder="leads@msruas.ac.in"
                        className="w-full px-4 py-2.5 bg-theme-background/40 border border-theme-card-border rounded-xl text-theme-text-primary focus:outline-none focus:border-accent"
                      />
                    </div>

                    <div className="space-y-1.5 relative">
                      <label className="block font-medium text-theme-text-secondary">App Password / Auth Secret</label>
                      <div className="relative">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          value={settings.authPass}
                          onChange={e => setSettings(prev => ({ ...prev, authPass: e.target.value }))}
                          placeholder="••••••••••••••••"
                          className="w-full pl-4 pr-10 py-2.5 bg-theme-background/40 border border-theme-card-border rounded-xl text-theme-text-primary focus:outline-none focus:border-accent"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-3 text-theme-text-secondary hover:text-theme-text-primary"
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  {settings.provider === 'outlook' && (
                    <div className="p-4 bg-amber-500/10 rounded-2xl border border-amber-500/25 space-y-1.5 text-[11px] text-theme-text-secondary leading-relaxed">
                      <span className="font-bold text-theme-text-primary flex items-center gap-1.5">
                        <ShieldAlert className="h-3.5 w-3.5 text-amber-500" />
                        Company email + password not connecting?
                      </span>
                      <p>
                        Microsoft 365 turns off SMTP AUTH (plain username/password sign-in) for every mailbox by default —
                        this is a tenant setting, not a wrong password. An admin has to enable it per mailbox: Microsoft 365
                        admin center → Users → Active users → this mailbox → Mail → &quot;Manage email apps&quot; → turn on
                        Authenticated SMTP. If the mailbox has multi-factor authentication (MFA) on, an app password is
                        required instead of the regular sign-in password. Use &quot;Test Connection &amp; Send Email&quot; below —
                        it now explains exactly which of these is blocking you.
                      </p>
                    </div>
                  )}
                </>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block font-medium text-theme-text-secondary">Sender Display Name *</label>
                  <input
                    type="text"
                    required
                    value={settings.fromName}
                    onChange={e => setSettings(prev => ({ ...prev, fromName: e.target.value }))}
                    placeholder="LEADS Next Gen Centre"
                    className="w-full px-4 py-2.5 bg-theme-background/40 border border-theme-card-border rounded-xl text-theme-text-primary focus:outline-none focus:border-accent"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block font-medium text-theme-text-secondary">Sender Email Address *</label>
                  <input
                    type="email"
                    required
                    value={settings.fromEmail}
                    onChange={e => setSettings(prev => ({ ...prev, fromEmail: e.target.value }))}
                    placeholder="leads@msruas.ac.in"
                    className="w-full px-4 py-2.5 bg-theme-background/40 border border-theme-card-border rounded-xl text-theme-text-primary focus:outline-none focus:border-accent"
                  />
                </div>
              </div>

              {settings.provider !== 'gmail' && settings.provider !== 'outlook' && (
              <div className="border-t border-theme-border/20 pt-4">
                <button
                  type="button"
                  onClick={() => setShowDkimSection(!showDkimSection)}
                  className="flex items-center gap-2 text-theme-text-secondary hover:text-theme-text-primary font-bold cursor-pointer"
                >
                  <Key className="h-3.5 w-3.5" />
                  DKIM Signing (Advanced)
                  {showDkimSection ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </button>

                {showDkimSection && (
                  <div className="mt-3 space-y-4">
                    <p className="text-[11px] text-theme-text-secondary leading-relaxed">
                      Optional — Nodemailer signs the message itself before handing it off, independent of the provider above. Requires the matching public key published as a DNS TXT record at <code className="bg-theme-background/40 px-1 py-0.5 rounded">&lt;dkimSelector&gt;._domainkey.&lt;dkimDomain&gt;</code>. Signing is skipped entirely unless all three fields below are filled in.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="block font-medium text-theme-text-secondary">DKIM Domain</label>
                        <input
                          type="text"
                          value={settings.dkimDomain || ''}
                          onChange={e => setSettings(prev => ({ ...prev, dkimDomain: e.target.value }))}
                          placeholder="leadsnextgencentre.online"
                          className="w-full px-4 py-2.5 bg-theme-background/40 border border-theme-card-border rounded-xl text-theme-text-primary focus:outline-none focus:border-accent"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="block font-medium text-theme-text-secondary">DKIM Selector</label>
                        <input
                          type="text"
                          value={settings.dkimSelector || ''}
                          onChange={e => setSettings(prev => ({ ...prev, dkimSelector: e.target.value }))}
                          placeholder="leads"
                          className="w-full px-4 py-2.5 bg-theme-background/40 border border-theme-card-border rounded-xl text-theme-text-primary focus:outline-none focus:border-accent"
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="block font-medium text-theme-text-secondary">DKIM Private Key</label>
                      <textarea
                        value={settings.dkimPrivateKey || ''}
                        onChange={e => setSettings(prev => ({ ...prev, dkimPrivateKey: e.target.value }))}
                        placeholder="-----BEGIN PRIVATE KEY-----&#10;...&#10;-----END PRIVATE KEY-----"
                        rows={6}
                        className="w-full px-4 py-2.5 bg-theme-background/40 border border-theme-card-border rounded-xl text-theme-text-primary focus:outline-none focus:border-accent font-mono text-[11px] leading-relaxed"
                      />
                    </div>
                  </div>
                )}
              </div>
              )}

              <div className="flex items-center justify-between pt-4 border-t border-theme-border/20">
                <span className="text-[11px] text-theme-text-secondary">
                  Last updated: {settings.updatedAt ? new Date(settings.updatedAt).toLocaleString() : 'Not configured'}
                </span>
                <button
                  type="submit"
                  disabled={isSavingSettings}
                  className="px-5 py-2.5 bg-accent hover:bg-primary-light text-white font-bold rounded-xl transition-all shadow-md shadow-accent/20 cursor-pointer disabled:opacity-50 flex items-center gap-2"
                >
                  <Server className="h-4 w-4" />
                  {isSavingSettings ? 'Saving Settings...' : 'Save SMTP Credentials'}
                </button>
              </div>
            </form>
          </div>

          <div className="glass-panel p-6 rounded-3xl space-y-5 border border-theme-card-border flex flex-col justify-between">
            <div className="space-y-4">
              <h3 className="text-base font-bold text-theme-text-primary flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-accent" />
                Connection Diagnostics & Test
              </h3>
              <p className="text-xs text-theme-text-secondary leading-relaxed">
                Test your SMTP server connection and verify credentials by transmitting a live test email payload.
              </p>

              <div className="space-y-1.5 text-xs">
                <label className="block font-medium text-theme-text-secondary">Test Recipient Email</label>
                <input
                  type="email"
                  value={testRecipient}
                  onChange={e => setTestRecipient(e.target.value)}
                  placeholder="kayo2970@gmail.com"
                  className="w-full px-4 py-2.5 bg-theme-background/40 border border-theme-card-border rounded-xl text-theme-text-primary focus:outline-none focus:border-accent"
                />
              </div>

              <button
                type="button"
                onClick={handleTestConnection}
                disabled={isTestingSmtp}
                className="w-full py-2.5 bg-accent/15 hover:bg-accent/25 text-accent border border-accent/20 font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 text-xs disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${isTestingSmtp ? 'animate-spin' : ''}`} />
                {isTestingSmtp ? 'Verifying SMTP Server...' : 'Test Connection & Send Email'}
              </button>

              {testResult && (
                <div className={`p-4 rounded-2xl border text-xs space-y-2 animate-in fade-in duration-300 ${
                  testResult.success 
                    ? 'bg-success/10 border-success/30 text-theme-text-primary' 
                    : 'bg-danger/10 border-danger/30 text-theme-text-primary'
                }`}>
                  <div className="flex items-center gap-2 font-bold">
                    {testResult.success ? (
                      <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
                    ) : (
                      <ShieldAlert className="h-4 w-4 text-danger shrink-0" />
                    )}
                    <span>{testResult.success ? 'SMTP Handshake Verified' : 'SMTP Handshake Error'}</span>
                  </div>
                  <p className="text-[11px] leading-relaxed opacity-90">{testResult.message}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Confirm Dispatch Modal */}
      {showDispatchConfirm && (
        <ConfirmModal
          isOpen={showDispatchConfirm}
          title="Confirm Email Dispatch"
          message={`Are you sure you want to dispatch this email broadcast? Target Scope: "${dispatchScope}". This will deliver emails through your configured SMTP server.`}
          confirmLabel="Execute Dispatch"
          cancelLabel="Cancel"
          onConfirm={handleExecuteDispatch}
          onCancel={() => setShowDispatchConfirm(false)}
        />
      )}

      {/* Inspect Email Log Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="glass-panel w-full max-w-2xl rounded-3xl p-6 space-y-5 border border-white/15 shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-theme-border/20 pb-4">
              <div>
                <h3 className="text-base font-bold text-theme-text-primary">Email Payload Inspector</h3>
                <p className="text-xs text-theme-text-secondary mt-0.5">Log ID: {selectedLog.id}</p>
              </div>
              <button
                onClick={() => setSelectedLog(null)}
                className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-theme-border/30 text-theme-text-secondary hover:text-theme-text-primary transition-all cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-4 bg-theme-border/10 p-3.5 rounded-2xl border border-theme-border/20">
                <div>
                  <span className="text-[10px] text-theme-text-secondary block font-medium">Recipient Address:</span>
                  <span className="font-bold text-theme-text-primary">{selectedLog.to}</span>
                </div>
                <div>
                  <span className="text-[10px] text-theme-text-secondary block font-medium">Delivery Status:</span>
                  <span className={`font-bold ${selectedLog.status === 'SENT' ? 'text-success' : 'text-danger'}`}>
                    {selectedLog.status === 'SENT' ? 'SENT / DELIVERED' : 'FAILED'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-theme-text-secondary block font-medium">Category:</span>
                  <span className="font-semibold text-accent">{selectedLog.category}</span>
                </div>
                <div>
                  <span className="text-[10px] text-theme-text-secondary block font-medium">Dispatched At:</span>
                  <span className="font-mono text-theme-text-primary">{new Date(selectedLog.sentAt).toLocaleString()}</span>
                </div>
              </div>

              <div>
                <span className="font-bold text-theme-text-primary block mb-1">Subject:</span>
                <div className="p-2.5 bg-theme-background/50 rounded-xl border border-theme-border/20 font-semibold text-accent">
                  {selectedLog.subject}
                </div>
              </div>

              {selectedLog.errorMessage && (
                <div>
                  <span className="font-bold text-danger block mb-1">Error Traceback:</span>
                  <div className="p-2.5 bg-danger/10 border border-danger/25 rounded-xl text-danger font-mono text-[11px] whitespace-pre-wrap">
                    {selectedLog.errorMessage}
                  </div>
                </div>
              )}
              {selectedLog.smtpResponse && (
                <div>
                  <span className="font-bold text-theme-text-primary block mb-1">SMTP Server Handshake Response:</span>
                  <div className="p-2.5 bg-theme-background/50 rounded-xl border border-theme-border/20 font-mono text-[11px] text-theme-text-secondary">
                    {selectedLog.smtpResponse}
                  </div>
                </div>
              )}

              <div>
                <span className="font-bold text-theme-text-primary block mb-1">Dispatched Body Content:</span>
                <div className="p-3 bg-slate-900 text-slate-200 rounded-xl border border-slate-800 font-mono text-[11px] max-h-48 overflow-y-auto whitespace-pre-wrap leading-relaxed">
                  {selectedLog.bodyText}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-theme-border/20">
              <button
                type="button"
                onClick={() => {
                  setDispatchScope('SINGLE');
                  setCustomRecipient(selectedLog.to);
                  setSubject(selectedLog.subject);
                  setBodyText(selectedLog.bodyText);
                  setSelectedLog(null);
                  setActiveTab('composer');
                  triggerToast('success', `Pre-filled composer with message payload for ${selectedLog.to}`);
                }}
                className="px-4 py-2 bg-accent/15 hover:bg-accent/25 text-accent border border-accent/30 text-xs font-bold rounded-xl cursor-pointer flex items-center gap-1.5 transition-all"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Reuse Payload in Composer
              </button>

              <button
                onClick={() => setSelectedLog(null)}
                className="px-4 py-2 bg-theme-border/30 hover:bg-theme-border/50 text-theme-text-primary text-xs font-bold rounded-xl cursor-pointer transition-all"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
