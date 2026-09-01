'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Plus,
  Trash2,
  Eye,
  Copy,
  CheckCircle2,
  Check,
  Ban,
  X,
  Edit2,
  ShieldAlert,
  FileText,
  FileDown,
  FileSpreadsheet,
  Clock,
  Table2,
  BarChart3,
  Gauge,
  LayoutTemplate,
  CalendarDays,
  Save,
  TrendingUp,
  Users,
  QrCode
} from 'lucide-react';
import { FormQrModal } from '@/components/form-qr-modal';
import {
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell
} from 'recharts';
import {
  getForms,
  addForm,
  updateForm,
  deleteForm,
  submitFormEdit,
  submitFormDelete,
  approveForm,
  rejectForm,
  getSubmissions,
  isSlugUnique,
  getFormTemplates,
  addFormTemplate,
  deleteFormTemplate,
  getEvents,
  getTasks,
  isApprovedEvent,
  FEEDBACK_FORM_TEMPLATE_ID,
  PublicFormItem,
  FormField,
  FormSubmissionItem,
  FormTemplateItem,
  EventItem,
  TaskItem
} from '@/lib/local-data';
import { canBuildForms, getFormApprovalRequirement, canApprovePendingForm } from '@/lib/permissions';
import { ConfirmModal } from '@/components/ui/confirm-modal';
import { EmptyState } from '@/components/ui/empty-state';

const CHART_COLORS = ['#3b82f6', '#6366f1', '#8b5cf6', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4'];

const CHARTABLE_TYPES: FormField['type'][] = ['scale', 'number', 'select', 'checkbox', 'multiselect'];

/**
 * Value -> count for one field across a form's submissions, keyed by the
 * raw answer. A multiselect answer is an array — each option the
 * respondent picked counts toward its own bucket ("select all that
 * apply" tallying), rather than the whole array being treated as one
 * combined key.
 */
function buildFieldCounts(field: FormField, subs: FormSubmissionItem[]): Record<string, number> {
  const counts: Record<string, number> = {};
  subs.forEach(s => {
    const raw = s.data[field.id] ?? s.data[field.label];
    if (raw === undefined || raw === null || raw === '') return;
    const values = Array.isArray(raw) ? raw : [raw];
    values.forEach(v => {
      if (v === undefined || v === null || v === '') return;
      const key = String(v);
      counts[key] = (counts[key] || 0) + 1;
    });
  });
  return counts;
}

function buildScaleChartData(field: FormField, subs: FormSubmissionItem[]) {
  const counts = buildFieldCounts(field, subs);
  return [1, 2, 3, 4, 5].map(n => ({ name: String(n), count: counts[String(n)] || 0 }));
}

function buildCategoryChartData(field: FormField, subs: FormSubmissionItem[]) {
  const counts = buildFieldCounts(field, subs);
  // Checkbox answers are stored as raw booleans, so their bucket keys are
  // the literal strings "true"/"false" — humanize those into Yes/No rather
  // than showing respondents' answers as JS boolean stringification.
  const labelFor = (key: string) => {
    if (field.type !== 'checkbox') return key;
    if (key === 'true') return 'Yes';
    if (key === 'false') return 'No';
    return key;
  };
  return Object.entries(counts)
    .map(([name, count]) => ({ name: labelFor(name), count }))
    .sort((a, b) => b.count - a.count);
}

/** A "nice" (round, never-too-tall) Y-axis ceiling for small response counts —
 *  recharts' own auto-domain rounds up aggressively (e.g. a max of 1 becomes
 *  a 0-4 axis), which leaves bars looking lost in mostly-empty charts on
 *  forms with only a handful of submissions so far. */
function chartCountDomainMax(dataMax: number): number {
  const max = Math.max(1, Math.ceil(dataMax));
  if (max <= 5) return max;
  const magnitude = 10 ** Math.floor(Math.log10(max));
  return Math.ceil(max / magnitude) * magnitude;
}

function computeAverage(field: FormField, subs: FormSubmissionItem[]): number | null {
  const values = subs
    .map(s => Number(s.data[field.id] ?? s.data[field.label]))
    .filter(v => !isNaN(v));
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Response count per calendar day, oldest first, for the submissions-over-time trend chart. */
function buildSubmissionsByDay(subs: FormSubmissionItem[]) {
  const counts: Record<string, number> = {};
  subs.forEach(s => {
    const day = (s.submittedAt || '').slice(0, 10);
    if (!day) return;
    counts[day] = (counts[day] || 0) + 1;
  });
  return Object.entries(counts)
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function escapeCsvValue(value: unknown): string {
  const str = (Array.isArray(value) ? value.join('; ') : String(value ?? '')).replace(/"/g, '""');
  return `"${str}"`;
}

export default function FormsBuilderPage() {
  const [forms, setForms] = useState<PublicFormItem[]>([]);
  const [submissions, setSubmissions] = useState<FormSubmissionItem[]>([]);
  const [templates, setTemplates] = useState<FormTemplateItem[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [user, setUser] = useState<any>(null);

  // Modals & Active Edit
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingForm, setEditingForm] = useState<PublicFormItem | null>(null);
  const [deletingFormId, setDeletingFormId] = useState<string | null>(null);
  const [rejectingFormId, setRejectingFormId] = useState<string | null>(null);
  const [rejectionReasonInput, setRejectionReasonInput] = useState('');
  const [isSaveTemplateOpen, setIsSaveTemplateOpen] = useState(false);
  const [templateNameDraft, setTemplateNameDraft] = useState('');
  const [qrModalForm, setQrModalForm] = useState<PublicFormItem | null>(null);

  // Form Creator State
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [committee, setCommittee] = useState('Senior Student Leadership');
  const [eventId, setEventId] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [fields, setFields] = useState<FormField[]>([
    { id: 'field_1', label: 'Full Name', type: 'text', required: true },
    { id: 'field_2', label: 'University Email', type: 'email', required: true }
  ]);

  // Selected Form for submissions view
  const [selectedFormId, setSelectedFormId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'table' | 'charts'>('table');

  // Notification States
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState('');
  const [formError, setFormError] = useState('');

  useEffect(() => {
    const refreshData = () => {
      const loadedForms = getForms();
      setForms(loadedForms);
      setSubmissions(getSubmissions());
      setTemplates(getFormTemplates());
      setEvents(getEvents());
      setTasks(getTasks());
    };
    refreshData();

    const loadedForms = getForms();
    if (loadedForms.length > 0) {
      setSelectedFormId(loadedForms[0].id);
    }

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

  const triggerNotification = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 4000);
  };

  const handleOpenCreate = () => {
    setTitle('');
    setSlug('');
    setDescription('');
    setCommittee(user?.committee === 'All Committees' ? 'Senior Student Leadership' : user?.committee || 'Senior Student Leadership');
    setEventId('');
    setSelectedTemplateId('');
    setFields([
      { id: 'f_1', label: 'Full Name', type: 'text', required: true },
      { id: 'f_2', label: 'University Email', type: 'email', required: true }
    ]);
    setFormError('');
    setIsCreateModalOpen(true);
  };

  const handleOpenEdit = (form: PublicFormItem) => {
    setEditingForm(form);
    setTitle(form.title);
    setSlug(form.slug);
    setDescription(form.description);
    setCommittee(form.committee);
    setEventId(form.eventId || '');
    setSelectedTemplateId('');
    setFields(form.fields);
    setFormError('');
  };

  const handleApplyTemplate = (templateId: string) => {
    setSelectedTemplateId(templateId);
    if (!templateId) return;
    const template = templates.find(t => t.id === templateId);
    if (template) {
      setFields(template.fields.map((f, i) => ({ ...f, id: `field_${Date.now()}_${i}` })));
    }
    // A form built from the Feedback Form Template should actually be
    // titled "Feedback Form" (for the linked event, if one's already
    // picked) — not left as whatever generic/blank title happened to be
    // in the field, which is what was showing up on the QR poster and
    // everywhere else the form's name is displayed.
    if (templateId === FEEDBACK_FORM_TEMPLATE_ID) {
      const linkedEvent = events.find(ev => ev.id === eventId);
      setTitle(linkedEvent ? `Feedback Form – ${linkedEvent.title}` : 'Feedback Form');
    }
  };

  const handleEventLink = (newEventId: string) => {
    setEventId(newEventId);
    // Keep an auto-generated Feedback Form title in sync with whichever
    // event is currently linked, as long as the title still looks
    // auto-generated (i.e. the user hasn't typed a custom one over it).
    if (selectedTemplateId === FEEDBACK_FORM_TEMPLATE_ID && (title === '' || title === 'Feedback Form' || title.startsWith('Feedback Form – '))) {
      const linkedEvent = events.find(ev => ev.id === newEventId);
      setTitle(linkedEvent ? `Feedback Form – ${linkedEvent.title}` : 'Feedback Form');
    }
  };

  const handleSaveTemplate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!templateNameDraft.trim()) return;
    addFormTemplate({
      name: templateNameDraft.trim(),
      fields,
      createdBy: user?.name || 'User'
    });
    setTemplates(getFormTemplates());
    setTemplateNameDraft('');
    setIsSaveTemplateOpen(false);
    triggerNotification('Field schema saved as a reusable template.');
  };

  const handleDeleteTemplate = (templateId: string) => {
    deleteFormTemplate(templateId, user?.name || 'User');
    setTemplates(getFormTemplates());
    if (selectedTemplateId === templateId) setSelectedTemplateId('');
  };

  const addField = () => {
    setFields([...fields, { id: 'field_' + Date.now(), label: 'New Question / Field', type: 'text', required: false }]);
  };

  const removeField = (index: number) => {
    if (fields.length <= 1) return;
    setFields(fields.filter((_, i) => i !== index));
  };

  const updateField = (index: number, key: keyof FormField, value: any) => {
    const updated = fields.map((f, i) => i === index ? { ...f, [key]: value } : f);
    setFields(updated);
  };

  const handleSaveForm = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!title.trim() || !slug.trim()) {
      setFormError('Form Title and Public URL Slug are required.');
      return;
    }

    const formattedSlug = slug.toLowerCase().replace(/[^a-z0-9-_]/g, '-');
    const linkedEvent = eventId ? events.find(ev => ev.id === eventId) : undefined;

    if (editingForm) {
      if (!isSlugUnique(formattedSlug, editingForm.id)) {
        setFormError(`The slug "${formattedSlug}" is already taken by another form. Choose a unique slug.`);
        return;
      }
      const changes = {
        title,
        slug: formattedSlug,
        description,
        committee,
        fields,
        eventId: eventId || undefined,
        eventName: linkedEvent?.title,
      };
      const approval = getFormApprovalRequirement(user, 'EDIT');
      if (approval.requiresApproval) {
        submitFormEdit(editingForm.id, changes, user?.name || 'User', user?.email || '', {
          approverType: approval.approverType,
          approverMemberId: approval.approverMemberId,
          approverPolicyTagId: approval.approverPolicyTagId,
          policyName: approval.policyName,
        });
        triggerNotification(`Edit submitted for approval from ${approval.approverName}. The live link keeps showing the current version until then.`);
      } else {
        updateForm(editingForm.id, changes, user?.name || 'User');
        triggerNotification('Public form updated successfully.');
      }
      setEditingForm(null);
    } else {
      if (!isSlugUnique(formattedSlug)) {
        setFormError(`The slug "${formattedSlug}" is already taken by another form. Choose a unique slug.`);
        return;
      }
      const newFormBase = {
        title,
        slug: formattedSlug,
        description,
        committee,
        fields,
        eventId: eventId || undefined,
        eventName: linkedEvent?.title,
        createdBy: user?.name || 'User',
        status: 'active' as const,
        sourceTemplateId: selectedTemplateId || undefined,
      };
      const approval = getFormApprovalRequirement(user, 'CREATE');
      if (approval.requiresApproval) {
        addForm({
          ...newFormBase,
          approvalStatus: 'pending_create',
          approverType: approval.approverType,
          approverMemberId: approval.approverMemberId,
          approverPolicyTagId: approval.approverPolicyTagId,
          approvalPolicyName: approval.policyName,
          submittedBy: user?.name,
          submittedByEmail: user?.email,
        });
        triggerNotification(`Form submitted for approval from ${approval.approverName}. Its public link goes live once approved.`);
      } else {
        addForm(newFormBase);
        triggerNotification('New dynamic public form created successfully. QR Code is ready.');
      }
      setIsCreateModalOpen(false);
    }

    const updated = getForms();
    setForms(updated);
    
    // Auto-open QR preview for newly created form if it wasn't an edit
    if (!editingForm) {
      const newlyCreated = updated.find(f => f.slug.toLowerCase() === formattedSlug.toLowerCase());
      if (newlyCreated) {
        setSelectedFormId(newlyCreated.id);
        setQrModalForm(newlyCreated);
      }
    }
  };

  const handleConfirmDelete = () => {
    if (!deletingFormId) return;
    const approval = getFormApprovalRequirement(user, 'DELETE');
    if (approval.requiresApproval) {
      submitFormDelete(deletingFormId, user?.name || 'User', user?.email || '', {
        approverType: approval.approverType,
        approverMemberId: approval.approverMemberId,
        approverPolicyTagId: approval.approverPolicyTagId,
        policyName: approval.policyName,
      });
      triggerNotification(`Deletion submitted for approval from ${approval.approverName}. The form stays live until then.`);
      setDeletingFormId(null);
      setForms(getForms());
      return;
    }
    deleteForm(deletingFormId, user?.name || 'User');
    setDeletingFormId(null);
    const updated = getForms();
    setForms(updated);
    setSubmissions(getSubmissions());
    if (selectedFormId === deletingFormId && updated.length > 0) {
      setSelectedFormId(updated[0].id);
    }
    triggerNotification('Public form deleted.');
  };

  const handleApproveForm = (id: string) => {
    const wasDelete = forms.find(f => f.id === id)?.approvalStatus === 'pending_delete';
    approveForm(id, user?.name || 'User');
    setForms(getForms());
    if (wasDelete) setSubmissions(getSubmissions());
    triggerNotification(wasDelete ? 'Approved. The form has been deleted.' : 'Approved. The form is now live.');
  };

  const handleConfirmRejectForm = () => {
    if (!rejectingFormId) return;
    rejectForm(rejectingFormId, user?.name || 'User', rejectionReasonInput || undefined);
    setForms(getForms());
    setRejectingFormId(null);
    setRejectionReasonInput('');
    triggerNotification('Rejected.');
  };

  const handleDownloadSubmissionsCsv = () => {
    if (!selectedForm || selectedSubmissions.length === 0) return;
    const headers = ['Timestamp', ...selectedForm.fields.map(f => f.label)];
    const rows = selectedSubmissions.map(sub => [
      sub.submittedAt,
      ...selectedForm.fields.map(f => sub.data[f.id] ?? sub.data[f.label] ?? ''),
    ]);
    const csv = [headers, ...rows].map(row => row.map(escapeCsvValue).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${selectedForm.slug}-submissions.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDownloadFilledWord = (submissionId: string) => {
    window.open(`/api/submissions/${submissionId}/word`, '_blank');
  };

  const handleCopyLink = (formSlug: string) => {
    const linkUrl = `${window.location.origin}/forms/${formSlug}`;
    navigator.clipboard.writeText(linkUrl);
    setCopiedSlug(formSlug);
    setTimeout(() => setCopiedSlug(null), 2000);
  };

  // PRD Gating: Super User (Tier 1) and Core Committee (Tier 5)
  const canBuild = canBuildForms(user);

  // Visibility: a pending/rejected submission is only shown to its submitter, its
  // resolved approver, and the Super User — mirrors the same rule on Events/Tasks.
  const canSeeFormApprovalMeta = (form: PublicFormItem) =>
    user?.tier === 1 || form.submittedByEmail === user?.email || canApprovePendingForm(form, user);
  const displayedForms = forms.filter(form => {
    if (form.approvalStatus === 'pending_create' || form.approvalStatus === 'rejected') {
      return canSeeFormApprovalMeta(form);
    }
    return true;
  });

  const selectedForm = displayedForms.find(f => f.id === selectedFormId) || displayedForms[0];
  const selectedSubmissions = selectedForm ? submissions.filter(s => s.formId === selectedForm.id || s.slug === selectedForm.slug) : [];

  return (
    <div className="p-6 md:p-8 space-y-6">
      
      {/* Alert Notification */}
      {successMsg && (
        <div className="flex items-center gap-3 p-4 bg-success/15 border border-success/20 rounded-2xl text-theme-text-primary text-xs animate-in fade-in duration-300">
          <CheckCircle2 className="h-5 w-5 text-success shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Header section with Create Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-theme-text-primary">Public Forms & Registration Builder</h1>
          <p className="text-xs text-theme-text-secondary">Generate responsive, shareable student registration and survey links</p>
        </div>
        {canBuild ? (
          <button
            onClick={handleOpenCreate}
            className="flex items-center gap-2 px-4 py-2.5 bg-accent hover:bg-primary-light text-white text-xs font-semibold rounded-xl transition-all shadow-md shadow-accent/15 cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            Build New Form
          </button>
        ) : (
          <span className="text-xs text-theme-text-secondary italic">
            Form creation permissions: Super User (Tier 1) & Core Committee (Tier 5)
          </span>
        )}
      </div>

      {/* Top-of-page stats summary bar */}
      {forms.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="glass-panel rounded-2xl p-4 flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-accent/15 text-accent flex items-center justify-center shrink-0">
              <FileText className="h-4.5 w-4.5" />
            </div>
            <div>
              <p className="text-lg font-bold text-theme-text-primary leading-none">{forms.length}</p>
              <p className="text-[10px] text-theme-text-secondary mt-1">Total Forms</p>
            </div>
          </div>
          <div className="glass-panel rounded-2xl p-4 flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center shrink-0">
              <Users className="h-4.5 w-4.5" />
            </div>
            <div>
              <p className="text-lg font-bold text-theme-text-primary leading-none">{submissions.length}</p>
              <p className="text-[10px] text-theme-text-secondary mt-1">Total Responses</p>
            </div>
          </div>
          <div className="glass-panel rounded-2xl p-4 flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-blue-500/15 text-blue-400 flex items-center justify-center shrink-0">
              <TrendingUp className="h-4.5 w-4.5" />
            </div>
            <div>
              <p className="text-lg font-bold text-theme-text-primary leading-none">
                {submissions.filter(s => {
                  const d = new Date(s.submittedAt);
                  const weekAgo = new Date();
                  weekAgo.setDate(weekAgo.getDate() - 7);
                  return !isNaN(d.getTime()) && d >= weekAgo;
                }).length}
              </p>
              <p className="text-[10px] text-theme-text-secondary mt-1">Responses This Week</p>
            </div>
          </div>
          <div className="glass-panel rounded-2xl p-4 flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center shrink-0">
              <LayoutTemplate className="h-4.5 w-4.5" />
            </div>
            <div>
              <p className="text-lg font-bold text-theme-text-primary leading-none">{templates.length}</p>
              <p className="text-[10px] text-theme-text-secondary mt-1">Saved Templates</p>
            </div>
          </div>
        </div>
      )}

      {/* Forms and Responses Layout */}
      {forms.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No public forms configured"
          description="Create custom registration forms for conferences, hackathons, and symposiums."
          actionLabel={canBuild ? "Build New Form" : undefined}
          onAction={canBuild ? handleOpenCreate : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Active Forms List */}
          <div className="glass-panel rounded-2xl p-6 lg:col-span-1 space-y-4 flex flex-col">
            <h3 className="text-sm font-bold text-theme-text-primary uppercase tracking-wider">
              Published Forms ({displayedForms.length})
            </h3>

            <div className="space-y-3 flex-1 overflow-y-auto max-h-[600px] pr-1">
              {displayedForms.map(form => {
                const isSelected = selectedForm?.id === form.id;
                const formSubs = submissions.filter(s => s.formId === form.id || s.slug === form.slug);

                return (
                  <div
                    key={form.id}
                    onClick={() => setSelectedFormId(form.id)}
                    className={`p-4 rounded-xl border transition-all cursor-pointer space-y-2.5 text-xs ${
                      isSelected
                        ? 'bg-accent/10 border-accent/40 shadow-sm'
                        : 'bg-theme-border/10 border-theme-border/20 hover:bg-theme-border/20'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <h4 className="font-bold text-theme-text-primary text-xs leading-snug">{form.title}</h4>
                          {form.isSample && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-warning/15 text-warning border border-warning/20">
                              Sample
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-theme-text-secondary mt-0.5 font-mono">/forms/{form.slug}</p>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-accent/15 text-accent">
                        {formSubs.length} responses
                      </span>
                    </div>

                    {(form.approvalStatus === 'pending_create' || form.approvalStatus === 'pending_edit' || form.approvalStatus === 'pending_delete') && canSeeFormApprovalMeta(form) && (
                      <div className={`flex items-center justify-between gap-2 p-2 border rounded-lg text-[10px] ${form.approvalStatus === 'pending_delete' ? 'bg-danger/10 border-danger/25' : 'bg-warning/10 border-warning/25'}`}>
                        <div className={`flex items-center gap-1 font-semibold ${form.approvalStatus === 'pending_delete' ? 'text-danger' : 'text-warning'}`}>
                          <Clock className="h-3 w-3 shrink-0" />
                          <span>
                            {form.approvalStatus === 'pending_delete' ? 'Deletion awaiting approval' : form.approvalStatus === 'pending_edit' ? 'Edit awaiting approval' : 'Awaiting approval'}
                          </span>
                        </div>
                        {canApprovePendingForm(form, user) && (
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={(e) => { e.stopPropagation(); handleApproveForm(form.id); }}
                              className="p-0.5 hover:bg-success/15 rounded text-success cursor-pointer"
                              title="Approve"
                            >
                              <Check className="h-3 w-3" />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); setRejectingFormId(form.id); }}
                              className="p-0.5 hover:bg-danger/15 rounded text-danger cursor-pointer"
                              title="Reject"
                            >
                              <Ban className="h-3 w-3" />
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {form.approvalStatus === 'rejected' && canSeeFormApprovalMeta(form) && (
                      <div className="flex items-center gap-1 p-2 bg-danger/10 border border-danger/25 rounded-lg text-[10px] text-danger font-semibold">
                        <Ban className="h-3 w-3 shrink-0" />
                        <span>Rejected by {form.decidedBy || 'approver'}{form.rejectionReason ? `: ${form.rejectionReason}` : ''}</span>
                      </div>
                    )}

                    <p className="text-[11px] text-theme-text-secondary line-clamp-1">
                      {form.description || `${form.fields.length} question fields`}
                    </p>

                    {form.eventName && (
                      <p className="text-[10px] text-accent flex items-center gap-1 font-semibold">
                        <CalendarDays className="h-3 w-3" />
                        Linked to {form.eventName}
                      </p>
                    )}

                    <div className="flex items-center justify-between pt-1 border-t border-theme-border/20 text-[11px]">
                      {form.approvalStatus === 'pending_create' ? (
                        <span className="text-theme-text-secondary italic">Link generates once approved</span>
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCopyLink(form.slug);
                          }}
                          className="text-accent hover:underline font-semibold flex items-center gap-1 cursor-pointer"
                        >
                          <Copy className="h-3 w-3" />
                          {copiedSlug === form.slug ? 'Copied Link!' : 'Copy Link'}
                        </button>
                      )}

                      <div className="flex items-center gap-1.5">
                        {form.approvalStatus !== 'pending_create' && (
                          <>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setQrModalForm(form);
                              }}
                              className="p-1 hover:bg-accent/15 rounded text-accent hover:text-accent cursor-pointer"
                              title="Preview & Download QR Code"
                            >
                              <QrCode className="h-3.5 w-3.5" />
                            </button>
                            <Link
                              href={`/forms/${form.slug}`}
                              target="_blank"
                              onClick={(e) => e.stopPropagation()}
                              className="p-1 hover:bg-theme-border/30 rounded text-theme-text-secondary hover:text-theme-text-primary"
                              title="Open Public Form View"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </Link>
                          </>
                        )}
                        {canBuild && (
                          <>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenEdit(form);
                              }}
                              className="p-1 hover:bg-theme-border/30 rounded text-theme-text-secondary hover:text-accent cursor-pointer"
                              title="Edit Form"
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </button>
                            {form.approvalStatus !== 'pending_delete' && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeletingFormId(form.id);
                                }}
                                className="p-1 hover:bg-danger/10 rounded text-danger cursor-pointer"
                                title="Delete Form"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Submissions & Form Preview Inspector */}
          <div className="glass-panel rounded-2xl p-6 lg:col-span-2 space-y-5">
            {selectedForm ? (
              <>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-theme-border/30">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-theme-text-primary">{selectedForm.title}</h3>
                      {selectedForm.isSample && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-warning/15 text-warning border border-warning/20">
                          Sample Dataset
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-theme-text-secondary mt-0.5">
                      Public URL: <code className="text-accent font-mono">/forms/{selectedForm.slug}</code> &middot; Created by {selectedForm.createdBy}
                    </p>
                    {selectedForm.eventName && (
                      <p className="text-[11px] text-accent mt-1 flex items-center gap-1 font-semibold">
                        <CalendarDays className="h-3.5 w-3.5" />
                        Linked to event: {selectedForm.eventName}
                      </p>
                    )}
                  </div>
                  {selectedForm.approvalStatus === 'pending_create' ? (
                    <span className="text-xs text-warning font-semibold flex items-center gap-1.5 self-start sm:self-auto">
                      <Clock className="h-3.5 w-3.5" /> Link generates once approved
                    </span>
                  ) : (
                    <div className="flex items-center gap-2 self-start sm:self-auto">
                      <button
                        onClick={() => setQrModalForm(selectedForm)}
                        className="px-3 py-1.5 bg-accent/15 hover:bg-accent/25 text-accent text-xs font-semibold rounded-xl transition-all border border-accent/30 cursor-pointer flex items-center gap-1.5"
                      >
                        <QrCode className="h-3.5 w-3.5" />
                        QR Code & Print
                      </button>
                      <button
                        onClick={() => handleCopyLink(selectedForm.slug)}
                        className="px-3 py-1.5 bg-theme-border/30 hover:bg-theme-border/50 text-theme-text-primary text-xs font-semibold rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
                      >
                        <Copy className="h-3.5 w-3.5" />
                        {copiedSlug === selectedForm.slug ? 'Copied!' : 'Share Link'}
                      </button>
                    </div>
                  )}
                </div>

                {/* Submissions: Table / Charts toggle */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-theme-text-primary uppercase tracking-wider">
                      Received Submissions ({selectedSubmissions.length})
                    </h4>
                    <div className="flex items-center gap-2">
                      {selectedSubmissions.length > 0 && (
                        <button
                          onClick={handleDownloadSubmissionsCsv}
                          className="px-2.5 py-1 bg-theme-border/30 hover:bg-theme-border/50 text-theme-text-primary rounded-lg transition-all text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                          title="Download all responses as CSV"
                        >
                          <FileDown className="h-3.5 w-3.5" />
                          CSV
                        </button>
                      )}
                      <div className="flex items-center gap-1 bg-theme-border/20 rounded-xl p-1">
                        <button
                          onClick={() => setViewMode('table')}
                          className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg transition-all cursor-pointer flex items-center gap-1 ${viewMode === 'table' ? 'bg-accent text-white' : 'text-theme-text-secondary'}`}
                        >
                          <Table2 className="h-3 w-3" /> Table
                        </button>
                        <button
                          onClick={() => setViewMode('charts')}
                          className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg transition-all cursor-pointer flex items-center gap-1 ${viewMode === 'charts' ? 'bg-accent text-white' : 'text-theme-text-secondary'}`}
                        >
                          <BarChart3 className="h-3 w-3" /> Charts
                        </button>
                      </div>
                    </div>
                  </div>

                  {selectedSubmissions.length === 0 ? (
                    <div className="text-center py-12 text-theme-text-secondary text-xs bg-theme-border/5 rounded-xl border border-theme-border/20">
                      No student responses submitted yet for this form link.
                    </div>
                  ) : viewMode === 'table' ? (
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-xs text-left">
                        <thead>
                          <tr className="text-theme-text-secondary border-b border-theme-border/40 text-xs">
                            <th className="pb-3 font-semibold">Timestamp</th>
                            {selectedForm.fields.map(f => (
                              <th key={f.id} className="pb-3 font-semibold">{f.label}</th>
                            ))}
                            {selectedForm.sourceTemplateId === FEEDBACK_FORM_TEMPLATE_ID && (
                              <th className="pb-3 font-semibold">Filled Copy</th>
                            )}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-theme-border/20">
                          {selectedSubmissions.map(sub => (
                            <tr key={sub.id} className="hover:bg-theme-border/10 transition-all text-xs">
                              <td className="py-3 pr-2 text-theme-text-secondary whitespace-nowrap">
                                <span className="flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {sub.submittedAt}
                                </span>
                              </td>
                              {selectedForm.fields.map(f => {
                                const val = sub.data[f.id] ?? sub.data[f.label];
                                const display = Array.isArray(val) ? (val.length > 0 ? val.join(', ') : '—') : String(val || '—');
                                return (
                                  <td key={f.id} className="py-3 pr-3 text-theme-text-primary max-w-xs truncate">
                                    {display}
                                  </td>
                                );
                              })}
                              {selectedForm.sourceTemplateId === FEEDBACK_FORM_TEMPLATE_ID && (
                                <td className="py-3 pr-3">
                                  <button
                                    onClick={() => handleDownloadFilledWord(sub.id)}
                                    className="p-1.5 bg-blue-500/10 hover:bg-blue-500/20 rounded-lg text-blue-400 transition-all cursor-pointer"
                                    title="Download filled feedback form (.docx)"
                                  >
                                    <FileText className="h-3.5 w-3.5" />
                                  </button>
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    (() => {
                      const chartableFields = selectedForm.fields.filter(f => CHARTABLE_TYPES.includes(f.type));
                      const scaleFields = selectedForm.fields.filter(f => f.type === 'scale');
                      const scaleAverages = scaleFields
                        .map(f => computeAverage(f, selectedSubmissions))
                        .filter((v): v is number => v !== null);
                      const overallAverage = scaleAverages.length > 0
                        ? scaleAverages.reduce((a, b) => a + b, 0) / scaleAverages.length
                        : null;
                      const weekAgo = new Date();
                      weekAgo.setDate(weekAgo.getDate() - 7);
                      const thisWeekCount = selectedSubmissions.filter(s => {
                        const d = new Date(s.submittedAt);
                        return !isNaN(d.getTime()) && d >= weekAgo;
                      }).length;
                      const trendData = buildSubmissionsByDay(selectedSubmissions);

                      return (
                        <div className="space-y-4">
                          {/* Analytics stats row */}
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                            <div className="p-3 bg-theme-border/10 border border-theme-border/20 rounded-xl">
                              <p className="text-lg font-bold text-theme-text-primary leading-none">{selectedSubmissions.length}</p>
                              <p className="text-[10px] text-theme-text-secondary mt-1">Total Responses</p>
                            </div>
                            <div className="p-3 bg-theme-border/10 border border-theme-border/20 rounded-xl">
                              <p className="text-lg font-bold text-theme-text-primary leading-none">{thisWeekCount}</p>
                              <p className="text-[10px] text-theme-text-secondary mt-1">This Week</p>
                            </div>
                            {overallAverage !== null && (
                              <div className="p-3 bg-theme-border/10 border border-theme-border/20 rounded-xl">
                                <p className="text-lg font-bold text-accent leading-none">{overallAverage.toFixed(1)} / 5.0</p>
                                <p className="text-[10px] text-theme-text-secondary mt-1">Overall Avg. Rating</p>
                              </div>
                            )}
                          </div>

                          {/* Submissions-over-time trend */}
                          {trendData.length > 1 && (
                            <div className="p-4 bg-theme-border/10 border border-theme-border/20 rounded-xl space-y-2">
                              <h5 className="text-xs font-bold text-theme-text-primary flex items-center gap-1.5">
                                <TrendingUp className="h-3.5 w-3.5 text-accent" />
                                Responses Over Time
                              </h5>
                              <div className="h-40 w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                  <AreaChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                                    <XAxis dataKey="date" tick={{ fill: 'currentColor', fontSize: 9 }} />
                                    <YAxis allowDecimals={false} domain={[0, chartCountDomainMax(Math.max(...trendData.map(d => d.count)))]} tick={{ fill: 'currentColor', fontSize: 10 }} />
                                    <Tooltip
                                      formatter={(value: any) => [`${value} response${value === 1 ? '' : 's'}`, 'Responses']}
                                      contentStyle={{
                                        backgroundColor: 'rgba(15, 23, 42, 0.9)',
                                        borderColor: 'rgba(255,255,255,0.1)',
                                        borderRadius: '12px',
                                        fontSize: '11px'
                                      }}
                                    />
                                    <Area type="monotone" dataKey="count" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.25} />
                                  </AreaChart>
                                </ResponsiveContainer>
                              </div>
                            </div>
                          )}

                          {chartableFields.length === 0 ? (
                            <div className="text-center py-12 text-theme-text-secondary text-xs bg-theme-border/5 rounded-xl border border-theme-border/20">
                              This form has no scale, number, or choice questions to chart yet — open text answers can't be charted.
                            </div>
                          ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {chartableFields.map(f => {
                            const isNumeric = f.type === 'scale' || f.type === 'number';
                            const data = f.type === 'scale' ? buildScaleChartData(f, selectedSubmissions) : buildCategoryChartData(f, selectedSubmissions);
                            const average = isNumeric ? computeAverage(f, selectedSubmissions) : null;
                            return (
                              <div key={f.id} className="p-4 bg-theme-border/10 border border-theme-border/20 rounded-xl space-y-2">
                                <div className="flex items-center justify-between">
                                  <h5 className="text-xs font-bold text-theme-text-primary">{f.label}</h5>
                                  {average !== null && (
                                    <span className="flex items-center gap-1 text-[11px] font-bold text-accent">
                                      <Gauge className="h-3 w-3" />
                                      Avg {average.toFixed(1)}{f.type === 'scale' ? ' / 5.0' : ''}
                                    </span>
                                  )}
                                </div>
                                {data.length === 0 ? (
                                  <p className="text-[11px] text-theme-text-secondary py-6 text-center">No responses to this question yet.</p>
                                ) : (
                                  <div className="h-48 w-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                      <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                                        <XAxis dataKey="name" tick={{ fill: 'currentColor', fontSize: 10 }} interval={0} angle={f.type === 'scale' ? 0 : -20} textAnchor={f.type === 'scale' ? 'middle' : 'end'} />
                                        <YAxis allowDecimals={false} domain={[0, chartCountDomainMax(Math.max(...data.map(d => d.count)))]} tick={{ fill: 'currentColor', fontSize: 10 }} />
                                        <Tooltip
                                          formatter={(value: any) => [`${value} response${value === 1 ? '' : 's'}`, f.label]}
                                          contentStyle={{
                                            backgroundColor: 'rgba(15, 23, 42, 0.9)',
                                            borderColor: 'rgba(255,255,255,0.1)',
                                            borderRadius: '12px',
                                            fontSize: '11px'
                                          }}
                                        />
                                        <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                                          {data.map((_, index) => (
                                            <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                                          ))}
                                        </Bar>
                                      </BarChart>
                                    </ResponsiveContainer>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                          )}
                        </div>
                      );
                    })()
                  )}
                </div>
              </>
            ) : (
              <div className="text-center py-12 text-theme-text-secondary text-xs">
                Select a published form from the left panel to inspect responses.
              </div>
            )}
          </div>

        </div>
      )}

      {/* Create / Edit Form Modal */}
      {(isCreateModalOpen || editingForm) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="glass-panel w-full max-w-2xl rounded-3xl p-6 flex flex-col space-y-5 relative border border-white/15 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-theme-text-primary">
                {editingForm ? 'Edit Public Form' : 'Build New Public Form'}
              </h2>
              <button 
                onClick={() => {
                  setIsCreateModalOpen(false);
                  setEditingForm(null);
                  setIsSaveTemplateOpen(false);
                }}
                className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-theme-border/30 text-theme-text-secondary hover:text-theme-text-primary transition-all cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {formError && (
              <div className="p-3 bg-danger/10 border border-danger/25 rounded-xl text-danger text-xs flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            {!editingForm && templates.length > 0 && (
              <div className="space-y-1.5 text-xs">
                <label className="block font-medium text-theme-text-secondary flex items-center gap-1.5">
                  <LayoutTemplate className="h-3.5 w-3.5" />
                  Start from Template (optional)
                </label>
                <div className="flex items-center gap-2">
                  <select
                    value={selectedTemplateId}
                    onChange={(e) => handleApplyTemplate(e.target.value)}
                    className="flex-1 px-4 py-2.5 bg-theme-background/30 border border-theme-card-border rounded-xl text-theme-text-primary focus:outline-none focus:border-accent"
                  >
                    <option value="">-- Blank Form --</option>
                    {templates.map(t => (
                      <option key={t.id} value={t.id}>{t.name} ({t.fields.length} fields)</option>
                    ))}
                  </select>
                  {selectedTemplateId && (
                    <button
                      type="button"
                      onClick={() => handleDeleteTemplate(selectedTemplateId)}
                      className="p-2.5 hover:bg-danger/10 rounded-xl text-danger transition-all cursor-pointer"
                      title="Delete This Template"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            )}

            <form onSubmit={handleSaveForm} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block font-medium text-theme-text-secondary">Form Title *</label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. AI Hackathon Registration 2026"
                    className="w-full px-4 py-2.5 bg-theme-background/30 border border-theme-card-border rounded-xl text-theme-text-primary focus:outline-none focus:border-accent"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block font-medium text-theme-text-secondary">Public Link Slug * (/forms/[slug])</label>
                  <input
                    type="text"
                    required
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                    placeholder="ai-hackathon-2026"
                    className="w-full px-4 py-2.5 bg-theme-background/30 border border-theme-card-border rounded-xl text-theme-text-primary focus:outline-none focus:border-accent font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block font-medium text-theme-text-secondary">Description / Respondent Instructions</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Explain event agenda, eligibility, and deadline details..."
                  rows={2}
                  className="w-full px-4 py-2.5 bg-theme-background/30 border border-theme-card-border rounded-xl text-theme-text-primary focus:outline-none focus:border-accent"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block font-medium text-theme-text-secondary flex items-center gap-1.5">
                  <CalendarDays className="h-3.5 w-3.5" />
                  Link to Event (optional)
                </label>
                <select
                  value={eventId}
                  onChange={(e) => handleEventLink(e.target.value)}
                  className="w-full px-4 py-2.5 bg-theme-background/30 border border-theme-card-border rounded-xl text-theme-text-primary focus:outline-none focus:border-accent"
                >
                  <option value="">-- No Event Linked --</option>
                  {events.filter(ev => isApprovedEvent(ev, tasks)).map(ev => (
                    <option key={ev.id} value={ev.id}>{ev.title}</option>
                  ))}
                </select>
              </div>

              {/* Dynamic Field Builder */}
              <div className="space-y-3 pt-2 border-t border-theme-border/20">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-xs text-theme-text-primary uppercase tracking-wider">
                    Form Questions & Field Schema ({fields.length})
                  </h4>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => { setTemplateNameDraft(''); setIsSaveTemplateOpen(true); }}
                      className="px-2.5 py-1 bg-theme-border/30 hover:bg-theme-border/50 text-theme-text-primary rounded-lg transition-all text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                      title="Save these fields as a reusable template"
                    >
                      <Save className="h-3.5 w-3.5" />
                      Save as Template
                    </button>
                    <button
                      type="button"
                      onClick={addField}
                      className="px-2.5 py-1 bg-accent/20 hover:bg-accent text-accent hover:text-white rounded-lg transition-all text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add Question
                    </button>
                  </div>
                </div>

                <div className="space-y-2.5">
                  {fields.map((field, idx) => (
                    <div key={field.id} className="p-3 bg-theme-border/10 border border-theme-border/20 rounded-xl space-y-2">
                      <div className="flex items-center gap-3">
                        <div className="flex-1 space-y-1">
                          <input
                            type="text"
                            required
                            value={field.label}
                            onChange={(e) => updateField(idx, 'label', e.target.value)}
                            placeholder="Question Label"
                            className="w-full px-3 py-1.5 bg-theme-background/40 border border-theme-border/30 rounded-lg text-theme-text-primary text-xs"
                          />
                        </div>

                        <div className="w-36">
                          <select
                            value={field.type}
                            onChange={(e) => updateField(idx, 'type', e.target.value)}
                            className="w-full px-2 py-1.5 bg-theme-background/40 border border-theme-border/30 rounded-lg text-theme-text-primary text-xs"
                          >
                            <option value="text">Short Text</option>
                            <option value="email">Email</option>
                            <option value="number">Number</option>
                            <option value="textarea">Paragraph</option>
                            <option value="scale">Scale (1-5)</option>
                            <option value="select">Single Choice</option>
                            <option value="multiselect">Multiple Choice</option>
                          </select>
                        </div>

                        <label className="flex items-center gap-1 text-[11px] text-theme-text-secondary cursor-pointer">
                          <input
                            type="checkbox"
                            checked={field.required}
                            onChange={(e) => updateField(idx, 'required', e.target.checked)}
                            className="accent-accent"
                          />
                          Required
                        </label>

                        <button
                          type="button"
                          onClick={() => removeField(idx)}
                          disabled={fields.length <= 1}
                          className="p-1.5 hover:bg-danger/10 rounded-lg text-danger transition-all cursor-pointer disabled:opacity-30"
                          title="Remove Question"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      {(field.type === 'select' || field.type === 'multiselect') && (
                        <div className="pl-0.5 space-y-1">
                          <label className="block text-[10px] font-medium text-theme-text-secondary">
                            {field.type === 'multiselect' ? 'Choices (respondent can pick one or more)' : 'Choices (respondent picks exactly one)'}
                          </label>
                          <input
                            type="text"
                            value={(field.options || []).join(', ')}
                            onChange={(e) => updateField(idx, 'options', e.target.value.split(',').map(o => o.trim()).filter(Boolean))}
                            placeholder="e.g. Workshop, Guest Lecture, Seminar/Conference"
                            className="w-full px-3 py-1.5 bg-theme-background/40 border border-theme-border/30 rounded-lg text-theme-text-primary text-xs"
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-accent hover:bg-primary-light text-white font-semibold rounded-xl transition-all shadow-md shadow-accent/15 cursor-pointer mt-4"
              >
                {editingForm ? 'Save Form Changes' : 'Publish Shareable Form Link'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Save as Template Modal */}
      {isSaveTemplateOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="glass-panel w-full max-w-sm rounded-3xl p-6 flex flex-col space-y-4 relative border border-white/15 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-theme-text-primary flex items-center gap-1.5">
                <LayoutTemplate className="h-4 w-4" />
                Save as Template
              </h2>
              <button
                onClick={() => setIsSaveTemplateOpen(false)}
                className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-theme-border/30 text-theme-text-secondary hover:text-theme-text-primary transition-all cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-[11px] text-theme-text-secondary">
              Saves the current {fields.length} question field{fields.length === 1 ? '' : 's'} as a reusable template you can start future forms from.
            </p>
            <form onSubmit={handleSaveTemplate} className="space-y-3 text-xs">
              <input
                type="text"
                required
                autoFocus
                value={templateNameDraft}
                onChange={(e) => setTemplateNameDraft(e.target.value)}
                placeholder="e.g. Event Registration — Standard"
                className="w-full px-4 py-2.5 bg-theme-background/30 border border-theme-card-border rounded-xl text-theme-text-primary focus:outline-none focus:border-accent"
              />
              <button
                type="submit"
                className="w-full py-2.5 bg-accent hover:bg-primary-light text-white font-semibold rounded-xl transition-all shadow-md shadow-accent/15 cursor-pointer"
              >
                Save Template
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={Boolean(deletingFormId)}
        title="Delete Public Form"
        message="Are you sure you want to delete this public form? The public link will become unreachable and any responses associated will be archived."
        confirmLabel="Delete Form"
        variant="danger"
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeletingFormId(null)}
      />

      {rejectingFormId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="glass-panel w-full max-w-md rounded-3xl p-6 flex flex-col space-y-4 relative border border-white/15 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-theme-text-primary flex items-center gap-2">
                <Ban className="h-4.5 w-4.5 text-danger" />
                Reject Submission
              </h2>
              <button
                onClick={() => { setRejectingFormId(null); setRejectionReasonInput(''); }}
                className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-theme-border/30 text-theme-text-secondary hover:text-theme-text-primary transition-all cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-1.5 text-xs">
              <label className="block font-medium text-theme-text-secondary">Reason (optional)</label>
              <textarea
                value={rejectionReasonInput}
                onChange={(e) => setRejectionReasonInput(e.target.value)}
                rows={3}
                placeholder="Let the submitter know why this was rejected..."
                className="w-full px-4 py-2.5 bg-theme-background/30 border border-theme-card-border rounded-xl text-theme-text-primary focus:outline-none focus:border-accent resize-none"
              />
            </div>
            <button
              onClick={handleConfirmRejectForm}
              className="w-full py-3 bg-danger hover:bg-danger/90 text-white font-semibold text-xs rounded-xl transition-all shadow-md cursor-pointer"
            >
              Confirm Rejection
            </button>
          </div>
        </div>
      )}

      {/* QR Code Preview & Download Modal */}
      <FormQrModal
        isOpen={Boolean(qrModalForm)}
        onClose={() => setQrModalForm(null)}
        form={qrModalForm}
        templates={templates}
      />

    </div>
  );
}
