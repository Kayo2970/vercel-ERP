'use client';

import React, { useState, useEffect } from 'react';
import {
  Send,
  UserPlus,
  X,
  Users,
  Mail,
  CheckCircle2,
  AlertCircle,
  Trash2,
  ClipboardList,
  ShieldAlert,
  Eye,
  Code2,
  Loader2,
  BookUser,
  Search,
  CheckSquare,
  Square,
} from 'lucide-react';
import { logAuditEvent, getGuests, getMembers, Guest as DirectoryGuest, Member } from '@/lib/local-data';
import { canManageGuestInvites } from '@/lib/permissions';
import { EmptyState } from '@/components/ui/empty-state';

interface Guest {
  id: string;
  name: string;
  email: string;
}

/** Replaces @name or {{name}} (and @email or {{email}}) with the guest's actual details. */
function applyMailMerge(template: string, guestName: string, guestEmail: string = ''): string {
  return template
    .replace(/\{\{\s*name\s*\}\}/gi, guestName)
    .replace(/@name\b/gi, guestName)
    .replace(/\{\{\s*email\s*\}\}/gi, guestEmail)
    .replace(/@email\b/gi, guestEmail);
}

export default function GuestInvitesPage() {
  const [user, setUser] = useState<any>(null);
  const [userHydrated, setUserHydrated] = useState(false);

  const [guests, setGuests] = useState<Guest[]>([]);
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [pasteText, setPasteText] = useState('');

  const [subject, setSubject] = useState('');
  const [bodyText, setBodyText] = useState('');
  const [previewMode, setPreviewMode] = useState<'edit' | 'preview'>('edit');

  const [isSending, setIsSending] = useState(false);
  const [sendProgress, setSendProgress] = useState({ sent: 0, failed: 0, total: 0 });
  const [resultMsg, setResultMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Guest Directory / Members Directory picker — lets a Centre Head add
  // people already on file instead of retyping their name/email by hand
  // each time. Two sources share one modal: external guest-directory
  // contacts, and internal LEADS members. Selections are keyed with a
  // "guests:"/"members:" prefix so switching tabs never loses a pick made
  // on the other one.
  const [directoryGuests, setDirectoryGuests] = useState<DirectoryGuest[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [pickerTab, setPickerTab] = useState<'guests' | 'members'>('guests');
  const [pickerSearch, setPickerSearch] = useState('');
  const [pickerSelectedIds, setPickerSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const savedUser = localStorage.getItem('user');
    if (savedUser) {
      try {
        setUser(JSON.parse(savedUser));
      } catch (e) {
        console.error(e);
      }
    }
    setUserHydrated(true);

    const refreshDirectory = () => {
      setDirectoryGuests(getGuests());
      setMembers(getMembers());
    };
    refreshDirectory();
    window.addEventListener('leads-data-sync', refreshDirectory);
    window.addEventListener('storage', refreshDirectory);
    return () => {
      window.removeEventListener('leads-data-sync', refreshDirectory);
      window.removeEventListener('storage', refreshDirectory);
    };
  }, []);

  const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const handleAddGuest = (e: React.FormEvent) => {
    e.preventDefault();
    const name = guestName.trim();
    const email = guestEmail.trim().toLowerCase();
    if (!name || !isValidEmail(email)) return;
    if (guests.some(g => g.email === email)) {
      setResultMsg({ type: 'error', text: `${email} is already in the guest list.` });
      return;
    }
    setGuests(prev => [...prev, { id: `guest_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, name, email }]);
    setGuestName('');
    setGuestEmail('');
  };

  const handleBulkPaste = () => {
    const lines = pasteText.split('\n').map(l => l.trim()).filter(Boolean);
    const existingEmails = new Set(guests.map(g => g.email));
    const added: Guest[] = [];
    let skipped = 0;

    for (const line of lines) {
      const parts = line.split(',').map(p => p.trim());
      if (parts.length < 2) { skipped++; continue; }
      const [name, emailRaw] = parts;
      const email = emailRaw.toLowerCase();
      if (!name || !isValidEmail(email) || existingEmails.has(email)) { skipped++; continue; }
      existingEmails.add(email);
      added.push({ id: `guest_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, name, email });
    }

    if (added.length > 0) {
      setGuests(prev => [...prev, ...added]);
      setPasteText('');
      setResultMsg({ type: 'success', text: `Added ${added.length} guest(s) from pasted list.${skipped > 0 ? ` Skipped ${skipped} invalid/duplicate line(s).` : ''}` });
    } else {
      setResultMsg({ type: 'error', text: 'No valid "Name, Email" rows found in the pasted text.' });
    }
  };

  const handleRemoveGuest = (id: string) => {
    setGuests(prev => prev.filter(g => g.id !== id));
  };

  const handleClearGuests = () => setGuests([]);

  // Guests in the Directory that have an email on file — invites need one, so
  // records without an email address aren't selectable here.
  const eligibleDirectoryGuests = directoryGuests.filter(g => isValidEmail(g.email || ''));
  // Terminated members can't log in anymore but their record stays on file —
  // exclude them from invites the same way an email-less guest is excluded.
  const eligibleMembers = members.filter(m => m.status !== 'Terminated' && isValidEmail(m.email || ''));

  const filteredDirectoryGuests = eligibleDirectoryGuests.filter(g => {
    const q = pickerSearch.toLowerCase();
    if (!q) return true;
    return (
      g.name.toLowerCase().includes(q) ||
      (g.organization || '').toLowerCase().includes(q) ||
      (g.email || '').toLowerCase().includes(q)
    );
  });

  const filteredMembers = eligibleMembers.filter(m => {
    const q = pickerSearch.toLowerCase();
    if (!q) return true;
    return (
      m.name.toLowerCase().includes(q) ||
      (m.department || '').toLowerCase().includes(q) ||
      (m.role || '').toLowerCase().includes(q) ||
      (m.email || '').toLowerCase().includes(q)
    );
  });

  const openPicker = (tab: 'guests' | 'members' = 'guests') => {
    setPickerSearch('');
    setPickerTab(tab);
    setPickerSelectedIds(new Set());
    setIsPickerOpen(true);
  };

  const togglePickerSelection = (key: string) => {
    setPickerSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const handleAddFromDirectory = () => {
    const existingEmails = new Set(guests.map(g => g.email));
    const selectedGuests = eligibleDirectoryGuests.filter(g => pickerSelectedIds.has(`guests:${g.id}`));
    const selectedMembers = eligibleMembers.filter(m => pickerSelectedIds.has(`members:${m.id}`));

    const toAdd = [...selectedGuests, ...selectedMembers]
      .filter(p => !existingEmails.has((p.email || '').toLowerCase()))
      .map(p => ({
        id: `guest_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: p.name,
        email: (p.email || '').toLowerCase(),
      }));

    if (toAdd.length > 0) {
      setGuests(prev => [...prev, ...toAdd]);
      const parts = [
        selectedGuests.length > 0 ? `${selectedGuests.length} from the Guest Directory` : '',
        selectedMembers.length > 0 ? `${selectedMembers.length} from LEADS Members` : '',
      ].filter(Boolean).join(' and ');
      setResultMsg({ type: 'success', text: `Added ${toAdd.length} guest(s) — ${parts}.` });
    }
    setIsPickerOpen(false);
  };

  const [badgeOption, setBadgeOption] = useState<string>('NONE');
  const [customBadgeText, setCustomBadgeText] = useState<string>('');

  const handleSendInvites = async () => {
    if (guests.length === 0 || !subject.trim() || !bodyText.trim()) return;
    setIsSending(true);
    setResultMsg(null);
    setSendProgress({ sent: 0, failed: 0, total: guests.length });

    let sent = 0;
    let failed = 0;

    let resolvedBadgeText: string | undefined = undefined;
    if (badgeOption === 'INVITATION') resolvedBadgeText = '🎉 Official Invitation';
    else if (badgeOption === 'ANNOUNCEMENT') resolvedBadgeText = '📢 Official Announcement';
    else if (badgeOption === 'ACTION_REQUIRED') resolvedBadgeText = '📌 Action Required';
    else if (badgeOption === 'IMPORTANT') resolvedBadgeText = '⚠️ Important Notice';
    else if (badgeOption === 'CUSTOM') resolvedBadgeText = customBadgeText.trim() || undefined;
    else resolvedBadgeText = undefined;

    for (const guest of guests) {
      try {
        const res = await fetch('/api/email/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            scope: 'SINGLE',
            recipientEmail: guest.email,
            subject: applyMailMerge(subject, guest.name, guest.email),
            bodyText: applyMailMerge(bodyText, guest.name, guest.email),
            category: 'GUEST_INVITE',
            badgeText: resolvedBadgeText,
          }),
        });
        if (res.ok) sent++; else failed++;
      } catch {
        failed++;
      }
      setSendProgress(prev => ({ ...prev, sent, failed }));
    }

    setIsSending(false);
    logAuditEvent(
      'GUEST_INVITES_SENT',
      user?.name || 'Centre Head',
      `Sent ${sent} guest invite email(s) (${failed} failed) — subject: "${subject.trim()}"`,
      user?.email
    );
    setResultMsg(
      failed === 0
        ? { type: 'success', text: `All ${sent} invite(s) sent successfully.` }
        : { type: 'error', text: `${sent} sent, ${failed} failed to send. Check Email Management > Outbox for details.` }
    );
  };

  if (!userHydrated) return null;

  if (!canManageGuestInvites(user)) {
    return (
      <div className="p-6 md:p-8">
        <EmptyState
          icon={ShieldAlert}
          title="Centre Head Access Required"
          description="Sending guest invitations is limited to the Centre Head, or a member granted Guest Invites access via Group Policies."
        />
      </div>
    );
  }

  const previewGuest = guests[0];

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-theme-text-primary flex items-center gap-2">
          <Send className="h-5 w-5 text-accent" />
          Guest Invites
        </h1>
        <p className="text-xs text-theme-text-secondary">
          Compose one invitation and personalize it for each guest using <code className="px-1 py-0.5 bg-theme-border/30 rounded text-[11px]">{'{{name}}'}</code> — pick people from the Guest Directory or add them by hand. This is a one-off invite batch and isn&apos;t saved back to the Directory.
        </p>
      </div>

      {resultMsg && (
        <div className={`flex items-center gap-3 p-4 rounded-2xl text-xs animate-in fade-in duration-300 ${
          resultMsg.type === 'success' ? 'bg-success/15 border border-success/20 text-theme-text-primary' : 'bg-danger/15 border border-danger/20 text-theme-text-primary'
        }`}>
          {resultMsg.type === 'success' ? <CheckCircle2 className="h-5 w-5 text-success shrink-0" /> : <AlertCircle className="h-5 w-5 text-danger shrink-0" />}
          <span>{resultMsg.text}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Guest List Panel */}
        <div className="glass-panel rounded-2xl p-5 space-y-4">
          <h2 className="text-sm font-bold text-theme-text-primary flex items-center gap-2">
            <Users className="h-4 w-4 text-accent" />
            Guest List ({guests.length})
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => openPicker('guests')}
              className="flex items-center justify-center gap-1.5 px-3.5 py-2 bg-accent/15 hover:bg-accent/25 border border-accent/30 text-accent text-xs font-semibold rounded-xl transition-all cursor-pointer"
            >
              <BookUser className="h-3.5 w-3.5" />
              Guest Directory{eligibleDirectoryGuests.length > 0 ? ` (${eligibleDirectoryGuests.length})` : ''}
            </button>
            <button
              type="button"
              onClick={() => openPicker('members')}
              className="flex items-center justify-center gap-1.5 px-3.5 py-2 bg-accent/15 hover:bg-accent/25 border border-accent/30 text-accent text-xs font-semibold rounded-xl transition-all cursor-pointer"
            >
              <Users className="h-3.5 w-3.5" />
              LEADS Members{eligibleMembers.length > 0 ? ` (${eligibleMembers.length})` : ''}
            </button>
          </div>

          <form onSubmit={handleAddGuest} className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={guestName}
              onChange={e => setGuestName(e.target.value)}
              placeholder="Or type a guest name"
              className="flex-1 min-w-0 px-3 py-2 bg-theme-background/30 border border-theme-card-border rounded-xl text-xs text-theme-text-primary focus:outline-none focus:border-accent"
            />
            <input
              type="email"
              value={guestEmail}
              onChange={e => setGuestEmail(e.target.value)}
              placeholder="guest@example.com"
              className="flex-1 min-w-0 px-3 py-2 bg-theme-background/30 border border-theme-card-border rounded-xl text-xs text-theme-text-primary focus:outline-none focus:border-accent"
            />
            <button
              type="submit"
              className="flex items-center justify-center gap-1.5 px-3.5 py-2 bg-accent hover:bg-primary-light text-white text-xs font-semibold rounded-xl transition-all cursor-pointer shrink-0"
            >
              <UserPlus className="h-3.5 w-3.5" />
              Add
            </button>
          </form>

          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-theme-text-secondary flex items-center gap-1.5">
              <ClipboardList className="h-3.5 w-3.5" />
              Or paste a list — one guest per line, as "Name, Email"
            </label>
            <textarea
              value={pasteText}
              onChange={e => setPasteText(e.target.value)}
              placeholder={'Ananya Sharma, ananya@example.com\nRahul Verma, rahul@example.com'}
              rows={3}
              className="w-full px-3 py-2 bg-theme-background/30 border border-theme-card-border rounded-xl text-xs text-theme-text-primary focus:outline-none focus:border-accent font-mono"
            />
            <button
              type="button"
              onClick={handleBulkPaste}
              disabled={!pasteText.trim()}
              className="px-3.5 py-1.5 bg-theme-border/30 hover:bg-theme-border/50 disabled:opacity-40 disabled:cursor-not-allowed text-theme-text-primary text-xs font-semibold rounded-xl transition-all cursor-pointer"
            >
              Parse & Add List
            </button>
          </div>

          <div className="max-h-72 overflow-y-auto space-y-1.5 pt-2 border-t border-theme-border/20">
            {guests.length === 0 ? (
              <p className="text-xs text-theme-text-secondary py-4 text-center">No guests added yet.</p>
            ) : (
              guests.map(g => (
                <div key={g.id} className="flex items-center justify-between gap-2 px-3 py-2 bg-theme-background/30 border border-theme-border/20 rounded-xl text-xs">
                  <div className="min-w-0">
                    <span className="font-semibold text-theme-text-primary block truncate">{g.name}</span>
                    <span className="text-theme-text-secondary block truncate">{g.email}</span>
                  </div>
                  <button
                    onClick={() => handleRemoveGuest(g.id)}
                    className="p-1 text-danger hover:bg-danger/10 rounded-lg transition-all cursor-pointer shrink-0"
                    title="Remove guest"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>

          {guests.length > 0 && (
            <button
              onClick={handleClearGuests}
              className="flex items-center gap-1.5 text-[11px] text-danger hover:underline cursor-pointer"
            >
              <Trash2 className="h-3 w-3" />
              Clear all guests
            </button>
          )}
        </div>

        {/* Template Composer Panel */}
        <div className="glass-panel rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-theme-text-primary flex items-center gap-2">
              <Mail className="h-4 w-4 text-accent" />
              Invitation Template
            </h2>
            <div className="flex items-center gap-1 bg-theme-border/20 rounded-xl p-1">
              <button
                onClick={() => setPreviewMode('edit')}
                className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg transition-all cursor-pointer flex items-center gap-1 ${previewMode === 'edit' ? 'bg-accent text-white' : 'text-theme-text-secondary'}`}
              >
                <Code2 className="h-3 w-3" /> Edit
              </button>
              <button
                onClick={() => setPreviewMode('preview')}
                disabled={!previewGuest}
                className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg transition-all cursor-pointer flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed ${previewMode === 'preview' ? 'bg-accent text-white' : 'text-theme-text-secondary'}`}
              >
                <Eye className="h-3 w-3" /> Preview
              </button>
            </div>
          </div>

          {previewMode === 'edit' ? (
            <>
              <div className="space-y-1.5">
                <label className="block text-[11px] font-medium text-theme-text-secondary">Header Tag / Badge Style</label>
                <select
                  value={badgeOption}
                  onChange={e => setBadgeOption(e.target.value)}
                  className="w-full px-3 py-2 bg-theme-background/30 border border-theme-card-border rounded-xl text-xs text-theme-text-primary focus:outline-none focus:border-accent"
                >
                  <option value="NONE">None (Clean Corporate Email - Recommended)</option>
                  <option value="INVITATION">🎉 Official Invitation</option>
                  <option value="ANNOUNCEMENT">📢 Official Announcement</option>
                  <option value="ACTION_REQUIRED">📌 Action Required</option>
                  <option value="IMPORTANT">⚠️ Important Notice</option>
                  <option value="CUSTOM">Custom Tag...</option>
                </select>
                {badgeOption === 'CUSTOM' && (
                  <input
                    type="text"
                    value={customBadgeText}
                    onChange={e => setCustomBadgeText(e.target.value)}
                    placeholder="Enter custom badge text (e.g. 🎓 Guest Invite)"
                    className="w-full px-3 py-1.5 bg-theme-background/30 border border-theme-card-border rounded-xl text-xs text-theme-text-primary focus:outline-none focus:border-accent mt-1"
                  />
                )}
              </div>
              <div className="space-y-1.5">
                <label className="block text-[11px] font-medium text-theme-text-secondary">Subject</label>
                <input
                  type="text"
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  placeholder="You're invited, @name!"
                  className="w-full px-3 py-2 bg-theme-background/30 border border-theme-card-border rounded-xl text-xs text-theme-text-primary focus:outline-none focus:border-accent"
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-[11px] font-medium text-theme-text-secondary">Message</label>
                  <div className="flex items-center gap-1.5 text-[10px]">
                    <span className="text-theme-text-secondary font-medium">Quick Insert:</span>
                    <button
                      type="button"
                      onClick={() => setBodyText(prev => prev + ' @name ')}
                      className="px-2 py-0.5 bg-accent/15 text-accent border border-accent/30 rounded-md font-semibold hover:bg-accent/25 transition-all cursor-pointer"
                      title="Insert guest name tag"
                    >
                      + @name
                    </button>
                    <button
                      type="button"
                      onClick={() => setBodyText(prev => prev + ' @email ')}
                      className="px-2 py-0.5 bg-accent/15 text-accent border border-accent/30 rounded-md font-semibold hover:bg-accent/25 transition-all cursor-pointer"
                      title="Insert guest email tag"
                    >
                      + @email
                    </button>
                  </div>
                </div>
                <textarea
                  value={bodyText}
                  onChange={e => setBodyText(e.target.value)}
                  placeholder={'Dear @name,\n\nYou are cordially invited to...'}
                  rows={10}
                  className="w-full px-3 py-2 bg-theme-background/30 border border-theme-card-border rounded-xl text-xs text-theme-text-primary focus:outline-none focus:border-accent"
                />
              </div>
            </>
          ) : (
            <div className="space-y-2">
              <p className="text-[11px] text-theme-text-secondary">Previewing as sent to <strong>{previewGuest?.name}</strong> ({previewGuest?.email})</p>
              <div className="p-3.5 bg-theme-background/30 border border-theme-border/20 rounded-xl space-y-2">
                <p className="text-xs font-bold text-theme-text-primary">{applyMailMerge(subject, previewGuest?.name || '', previewGuest?.email || '') || '(no subject)'}</p>
                <p className="text-xs text-theme-text-secondary whitespace-pre-wrap">{applyMailMerge(bodyText, previewGuest?.name || '', previewGuest?.email || '') || '(no message)'}</p>
              </div>
            </div>
          )}

          <button
            onClick={handleSendInvites}
            disabled={isSending || guests.length === 0 || !subject.trim() || !bodyText.trim()}
            className="w-full flex items-center justify-center gap-2 py-3 bg-accent hover:bg-primary-light disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-all shadow-md shadow-accent/15 cursor-pointer text-xs"
          >
            {isSending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Sending {sendProgress.sent + sendProgress.failed} / {sendProgress.total}...
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                Send to {guests.length} Guest{guests.length === 1 ? '' : 's'}
              </>
            )}
          </button>
        </div>
      </div>

      {/* Guest Directory Picker Modal */}
      {isPickerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="glass-panel w-full max-w-lg rounded-3xl p-6 flex flex-col space-y-4 relative border border-white/15 shadow-2xl max-h-[85vh]">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-theme-text-primary flex items-center gap-2">
                <BookUser className="h-4.5 w-4.5 text-accent" />
                Add People
              </h2>
              <button
                onClick={() => setIsPickerOpen(false)}
                className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-theme-border/30 text-theme-text-secondary hover:text-theme-text-primary transition-all cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex items-center gap-1 bg-theme-border/20 rounded-xl p-1">
              <button
                type="button"
                onClick={() => setPickerTab('guests')}
                className={`flex-1 px-2.5 py-1.5 text-[11px] font-semibold rounded-lg transition-all cursor-pointer ${pickerTab === 'guests' ? 'bg-accent text-white' : 'text-theme-text-secondary'}`}
              >
                Guest Directory{eligibleDirectoryGuests.length > 0 ? ` (${eligibleDirectoryGuests.length})` : ''}
              </button>
              <button
                type="button"
                onClick={() => setPickerTab('members')}
                className={`flex-1 px-2.5 py-1.5 text-[11px] font-semibold rounded-lg transition-all cursor-pointer ${pickerTab === 'members' ? 'bg-accent text-white' : 'text-theme-text-secondary'}`}
              >
                LEADS Members{eligibleMembers.length > 0 ? ` (${eligibleMembers.length})` : ''}
              </button>
            </div>

            <div className="flex items-center gap-2 px-3 py-2 bg-theme-background/30 border border-theme-card-border rounded-xl">
              <Search className="h-4 w-4 text-theme-text-secondary shrink-0" />
              <input
                type="text"
                value={pickerSearch}
                onChange={e => setPickerSearch(e.target.value)}
                placeholder={pickerTab === 'guests' ? 'Search by name, organization, or email...' : 'Search by name, role/department, or email...'}
                className="w-full bg-transparent border-0 focus:outline-none focus:ring-0 text-xs text-theme-text-primary placeholder-theme-text-secondary"
              />
            </div>

            <div className="flex-1 overflow-y-auto space-y-1.5 min-h-[12rem]">
              {pickerTab === 'guests' ? (
                eligibleDirectoryGuests.length === 0 ? (
                  <p className="text-xs text-theme-text-secondary py-8 text-center">
                    No Guest Directory entries with an email address on file yet.
                  </p>
                ) : filteredDirectoryGuests.length === 0 ? (
                  <p className="text-xs text-theme-text-secondary py-8 text-center">No matches for your search.</p>
                ) : (
                  filteredDirectoryGuests.map(g => {
                    const key = `guests:${g.id}`;
                    const isSelected = pickerSelectedIds.has(key);
                    const alreadyAdded = guests.some(existing => existing.email === (g.email || '').toLowerCase());
                    return (
                      <button
                        key={key}
                        type="button"
                        disabled={alreadyAdded}
                        onClick={() => togglePickerSelection(key)}
                        className={`w-full flex items-center gap-2.5 text-left px-3 py-2.5 rounded-xl text-xs transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                          isSelected ? 'bg-accent/10 border border-accent/40' : 'bg-theme-background/30 border border-theme-border/20 hover:bg-theme-border/20'
                        }`}
                      >
                        {isSelected ? (
                          <CheckSquare className="h-4 w-4 text-accent shrink-0" />
                        ) : (
                          <Square className="h-4 w-4 text-theme-text-secondary/60 shrink-0" />
                        )}
                        <div className="min-w-0">
                          <span className="font-semibold text-theme-text-primary block truncate">
                            {g.name}{g.organization ? ` — ${g.organization}` : ''}
                          </span>
                          <span className="text-theme-text-secondary block truncate">
                            {g.email}{alreadyAdded ? ' (already in list)' : ''}
                          </span>
                        </div>
                      </button>
                    );
                  })
                )
              ) : (
                eligibleMembers.length === 0 ? (
                  <p className="text-xs text-theme-text-secondary py-8 text-center">
                    No Members Directory entries with an email address on file yet.
                  </p>
                ) : filteredMembers.length === 0 ? (
                  <p className="text-xs text-theme-text-secondary py-8 text-center">No matches for your search.</p>
                ) : (
                  filteredMembers.map(m => {
                    const key = `members:${m.id}`;
                    const isSelected = pickerSelectedIds.has(key);
                    const alreadyAdded = guests.some(existing => existing.email === (m.email || '').toLowerCase());
                    return (
                      <button
                        key={key}
                        type="button"
                        disabled={alreadyAdded}
                        onClick={() => togglePickerSelection(key)}
                        className={`w-full flex items-center gap-2.5 text-left px-3 py-2.5 rounded-xl text-xs transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                          isSelected ? 'bg-accent/10 border border-accent/40' : 'bg-theme-background/30 border border-theme-border/20 hover:bg-theme-border/20'
                        }`}
                      >
                        {isSelected ? (
                          <CheckSquare className="h-4 w-4 text-accent shrink-0" />
                        ) : (
                          <Square className="h-4 w-4 text-theme-text-secondary/60 shrink-0" />
                        )}
                        <div className="min-w-0">
                          <span className="font-semibold text-theme-text-primary block truncate">
                            {m.name}{m.role ? ` — ${m.role}` : ''}
                          </span>
                          <span className="text-theme-text-secondary block truncate">
                            {m.email}{alreadyAdded ? ' (already in list)' : ''}
                          </span>
                        </div>
                      </button>
                    );
                  })
                )
              )}
            </div>

            <button
              type="button"
              onClick={handleAddFromDirectory}
              disabled={pickerSelectedIds.size === 0}
              className="w-full py-3 bg-accent hover:bg-primary-light disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-all shadow-md shadow-accent/15 cursor-pointer text-xs"
            >
              Add {pickerSelectedIds.size > 0 ? `${pickerSelectedIds.size} Selected` : 'Selected'} Guest{pickerSelectedIds.size === 1 ? '' : 's'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
