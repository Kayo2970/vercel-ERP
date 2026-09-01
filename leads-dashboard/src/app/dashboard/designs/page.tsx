'use client';

import React, { useState, useEffect } from 'react';
import {
  Palette,
  UploadCloud,
  FileText,
  CheckCircle2,
  Clock,
  AlertCircle,
  MessageSquare,
  Trash2,
  Eye,
  ShieldAlert,
  UserCheck,
  Calendar,
  FileCheck,
  Search,
  X,
  Send,
  Lock,
  Download,
  Sparkles,
  CheckSquare,
  Star,
  Plus,
  Edit2,
  RefreshCw
} from 'lucide-react';
import { FileDropzone, FilePreviewRow, createProgressTracker } from '@/components/ui/file-dropzone';
import {
  getDesigns,
  addDesign,
  updateDesignReview,
  updateDesignStyleReview,
  updateDesignFile,
  deleteDesign,
  getMembers,
  getEvents,
  isApprovedEvent,
  addEvent,
  getTasks,
  submitDesignCaptions,
  reviewDesignCaptions,
  completeDesignPosting,
  resolveDesignReviewer,
  DesignSubmissionItem,
  Member,
  EventItem,
  TaskItem,
  OcrScanResult
} from '@/lib/local-data';
import { canViewAllDesigns, isDesignHead, isCentreHead, hasCapability } from '@/lib/permissions';

/** Renders an OCR scan's flagged spelling issues + extracted text preview. Advisory only. */
function OcrScanPanel({
  result,
  error,
  showExtractedText,
  onToggleExtractedText,
}: {
  result: OcrScanResult | null;
  error: string;
  showExtractedText: boolean;
  onToggleExtractedText: () => void;
}) {
  const [activeIssue, setActiveIssue] = useState<number | null>(null);

  if (error) {
    return (
      <p className="text-amber-500 font-medium text-[11px] flex items-center gap-1 pt-2">
        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
        {error} You can still submit this file without scanning it.
      </p>
    );
  }
  if (!result) return null;

  return (
    <div className="mt-2 p-3 bg-muted/20 border border-border rounded-lg space-y-2 text-xs">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-foreground">
          {result.issues.length === 0 ? 'No spelling issues detected' : `${result.issues.length} possible spelling issue${result.issues.length === 1 ? '' : 's'} found`}
        </span>
        <span className="text-[10px] text-muted-foreground font-mono">
          {new Date(result.scannedAt).toLocaleTimeString()}
        </span>
      </div>

      {result.partial && (
        <p className="text-[11px] text-amber-500 flex items-center gap-1">
          <AlertCircle className="h-3 w-3 shrink-0" />
          Scanned the first {result.pageCount} of {result.totalPages} pages.
        </p>
      )}

      {/* Page previews with a highlight box drawn directly over each flagged word */}
      {result.pageImages.length > 0 && result.issues.length > 0 && (
        <div className="space-y-2">
          {result.pageImages.map((page, pageIndex) => {
            const pageIssues = result.issues
              .map((issue, i) => ({ issue, i }))
              .filter(({ issue }) => issue.pageIndex === pageIndex);
            if (pageIssues.length === 0) return null;
            return (
              <div key={pageIndex} className="space-y-1">
                {result.pageImages.length > 1 && (
                  <p className="text-[10px] font-semibold text-muted-foreground">Page {pageIndex + 1}</p>
                )}
                <div className="relative w-full border border-border rounded-lg overflow-hidden bg-background">
                  <img src={page.dataUrl} alt={`Scanned page ${pageIndex + 1}`} className="w-full h-auto block" />
                  {pageIssues.map(({ issue, i }) => (
                    <div
                      key={i}
                      onMouseEnter={() => setActiveIssue(i)}
                      onMouseLeave={() => setActiveIssue(null)}
                      className={`absolute rounded-sm transition-colors cursor-help ${
                        activeIssue === i ? 'border-2 border-accent bg-accent/20' : 'border-2 border-rose-500 bg-rose-500/10'
                      }`}
                      style={{
                        left: `${(issue.bbox.x0 / page.width) * 100}%`,
                        top: `${(issue.bbox.y0 / page.height) * 100}%`,
                        width: `${Math.max(((issue.bbox.x1 - issue.bbox.x0) / page.width) * 100, 0.5)}%`,
                        height: `${Math.max(((issue.bbox.y1 - issue.bbox.y0) / page.height) * 100, 0.5)}%`,
                      }}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {result.issues.length > 0 && (
        <ul className="space-y-1">
          {result.issues.map((issue, i) => (
            <li
              key={i}
              onMouseEnter={() => setActiveIssue(i)}
              onMouseLeave={() => setActiveIssue(null)}
              className={`flex items-center gap-1.5 flex-wrap px-1.5 py-1 rounded-md transition-colors ${activeIssue === i ? 'bg-accent/15' : ''}`}
            >
              <span className="font-mono font-semibold text-rose-500">{issue.word}</span>
              {result.pageImages.length > 1 && (
                <span className="text-[10px] text-muted-foreground">(page {issue.pageIndex + 1})</span>
              )}
              {issue.suggestions.length > 0 && (
                <>
                  <span className="text-muted-foreground">&rarr;</span>
                  <span className="text-emerald-500 font-medium">{issue.suggestions.join(', ')}</span>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="text-[10px] text-muted-foreground italic">
        Automatic suggestions only — review manually. This never blocks submission.
      </p>

      {result.extractedText && (
        <div className="pt-1 border-t border-border">
          <button
            type="button"
            onClick={onToggleExtractedText}
            className="text-[11px] text-accent hover:underline font-medium cursor-pointer"
          >
            {showExtractedText ? 'Hide extracted text' : 'Show extracted text'}
          </button>
          {showExtractedText && (
            <pre className="mt-1.5 p-2 bg-background border border-border rounded-lg text-[10px] whitespace-pre-wrap max-h-40 overflow-y-auto text-muted-foreground">
              {result.extractedText}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

export default function DesignPortalPage() {
  const [designs, setDesigns] = useState<DesignSubmissionItem[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [user, setUser] = useState<any>(null);

  // Filter & Search states
  const [activeTab, setActiveTab] = useState<'all' | 'mine' | 'proofread' | 'expired'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modals
  const [showUploadModal, setShowUploadModal] = useState<boolean>(false);
  const [selectedDesign, setSelectedDesign] = useState<DesignSubmissionItem | null>(null);
  const [showInspectorModal, setShowInspectorModal] = useState<boolean>(false);

  // Quick Event Creation Modal state
  const [showQuickEventModal, setShowQuickEventModal] = useState<boolean>(false);
  const [newEventTitle, setNewEventTitle] = useState('');
  const [newEventDesc, setNewEventDesc] = useState('');
  const [newEventCampus, setNewEventCampus] = useState<'GG Campus' | 'RTC Campus' | 'Both Campuses'>('GG Campus');
  const [newEventStartDate, setNewEventStartDate] = useState('');
  const [newEventEndDate, setNewEventEndDate] = useState('');
  const [newEventDatesTBD, setNewEventDatesTBD] = useState(false);
  const [newEventLocation, setNewEventLocation] = useState('');
  const [isCreatingEvent, setIsCreatingEvent] = useState(false);
  const [quickEventError, setQuickEventError] = useState('');

  const handleQuickEventSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEventTitle.trim()) {
      setQuickEventError('Event title is required.');
      return;
    }
    setIsCreatingEvent(true);
    try {
      const created = addEvent({
        title: newEventTitle.trim(),
        description: newEventDesc.trim(),
        campus: newEventCampus,
        startDate: newEventDatesTBD ? '' : newEventStartDate,
        endDate: newEventDatesTBD ? '' : newEventEndDate,
        datesTBD: newEventDatesTBD,
        location: newEventLocation.trim() || undefined,
        status: 'planned',
        createdBy: user?.name || 'User',
      });

      // Refresh local events & automatically select the new event
      const updatedEvents = getEvents();
      setEvents(updatedEvents);
      setEventId(created.id);

      // Reset and close quick event modal
      setNewEventTitle('');
      setNewEventDesc('');
      setNewEventStartDate('');
      setNewEventEndDate('');
      setNewEventDatesTBD(false);
      setNewEventLocation('');
      setQuickEventError('');
      setShowQuickEventModal(false);
    } catch (err: any) {
      setQuickEventError(err?.message || 'Failed to create event.');
    } finally {
      setIsCreatingEvent(false);
    }
  };

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<DesignSubmissionItem['category']>('Poster');
  const [eventId, setEventId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [fileData, setFileData] = useState<string>('');
  const [fileError, setFileError] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  // Every submission is auto-routed to whoever resolveDesignReviewer() picks
  // (Centre Head, then GG Campus Events Head, then Super User) — shown here
  // purely so the submitter knows who'll be proofreading, nothing more.
  const mandatoryReviewer = resolveDesignReviewer();
  // Reading the file into base64 happens asynchronously (FileReader), separately
  // from the "Uploading..." server round-trip — both get their own progress state
  // so a large file doesn't look "attached and ready" before it actually is.
  const [isReadingFile, setIsReadingFile] = useState<boolean>(false);
  const [readProgress, setReadProgress] = useState<number>(0);
  const [submitError, setSubmitError] = useState<string>('');
  // Real percent + time-remaining for the actual server upload, driven by
  // addDesign()'s onProgress callback — replaces the old indeterminate bar,
  // which could only say "something is happening," never how long it'd take.
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [uploadEtaSeconds, setUploadEtaSeconds] = useState<number | null>(null);

  // OCR + spell-check scan (advisory only — never blocks submission)
  const [ocrScanResult, setOcrScanResult] = useState<OcrScanResult | null>(null);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [scanError, setScanError] = useState<string>('');
  const [showExtractedText, setShowExtractedText] = useState<boolean>(false);

  // Proofread Review form state inside Inspector Modal
  const [reviewStatus, setReviewStatus] = useState<'Proofread Approved' | 'Changes Requested'>('Proofread Approved');
  const [reviewComments, setReviewComments] = useState('');

  // Design Head Style Review form state inside Inspector Modal
  const [styleStatus, setStyleStatus] = useState<'Style Approved' | 'Style Rejected'>('Style Approved');
  const [styleFeedback, setStyleFeedback] = useState('');

  // Replace File form state inside Inspector Modal (design owner only)
  const [replaceFile, setReplaceFile] = useState<File | null>(null);
  const [replaceFileData, setReplaceFileData] = useState<string>('');
  const [replaceFileError, setReplaceFileError] = useState<string>('');
  const [isReplacingFile, setIsReplacingFile] = useState<boolean>(false);
  const [isReadingReplaceFile, setIsReadingReplaceFile] = useState<boolean>(false);
  const [replaceReadProgress, setReplaceReadProgress] = useState<number>(0);
  const [replaceUploadProgress, setReplaceUploadProgress] = useState<number>(0);
  const [replaceUploadEtaSeconds, setReplaceUploadEtaSeconds] = useState<number | null>(null);
  const [replaceOcrScanResult, setReplaceOcrScanResult] = useState<OcrScanResult | null>(null);
  const [isScanningReplace, setIsScanningReplace] = useState<boolean>(false);
  const [replaceScanError, setReplaceScanError] = useState<string>('');

  // Social Media Workflow form state inside Inspector Modal
  const [instaCaptionInput, setInstaCaptionInput] = useState('');
  const [linkedinCaptionInput, setLinkedinCaptionInput] = useState('');
  const [captionReviewApproved, setCaptionReviewApproved] = useState(true);
  const [captionReviewCommentsInput, setCaptionReviewCommentsInput] = useState('');

  // Deep link from a notification (?highlight=<designId>) — auto-open its Inspector once
  const [highlightDesignId, setHighlightDesignId] = useState<string | null>(null);
  const [hasOpenedHighlight, setHasOpenedHighlight] = useState(false);

  const openInspector = (design: DesignSubmissionItem) => {
    setSelectedDesign(design);
    setReviewComments(design.review?.comments || '');
    setReviewStatus(design.review?.status === 'Changes Requested' ? 'Changes Requested' : 'Proofread Approved');
    setStyleFeedback(design.styleFeedback || '');
    setStyleStatus(design.styleStatus === 'Style Rejected' ? 'Style Rejected' : 'Style Approved');
    setInstaCaptionInput(design.draftInstagramCaption || design.approvedInstagramCaption || '');
    setLinkedinCaptionInput(design.draftLinkedinCaption || design.approvedLinkedinCaption || '');
    setCaptionReviewApproved(true);
    setCaptionReviewCommentsInput(design.captionReviewComments || '');
    setShowExtractedText(false);
    setReplaceOcrScanResult(null);
    setReplaceScanError('');
    setShowInspectorModal(true);
  };

  const handleSubmitCaptions = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDesign || !user || !instaCaptionInput.trim()) return;
    const updated = submitDesignCaptions(selectedDesign.id, instaCaptionInput.trim(), linkedinCaptionInput.trim(), user.name);
    if (updated) {
      setSelectedDesign(updated);
      setDesigns(getDesigns());
      setTasks(getTasks());
    }
  };

  const handleReviewCaptions = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDesign || !user) return;
    const updated = reviewDesignCaptions(selectedDesign.id, captionReviewApproved, captionReviewCommentsInput.trim(), user.name);
    if (updated) {
      setSelectedDesign(updated);
      setDesigns(getDesigns());
      setTasks(getTasks());
    }
  };

  const handleCompletePosting = (platform: 'instagram' | 'linkedin') => {
    if (!selectedDesign || !user) return;
    const updated = completeDesignPosting(selectedDesign.id, platform, user.name);
    if (updated) {
      setSelectedDesign(updated);
      setDesigns(getDesigns());
      setTasks(getTasks());
    }
  };

  const handleSaveStyleReview = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDesign || !user) return;
    const updated = updateDesignStyleReview(selectedDesign.id, styleStatus, styleFeedback, user.name);
    if (updated) {
      setSelectedDesign(updated);
      setDesigns(getDesigns());
    }
  };

  const handleReplaceFile = (selected: File | undefined) => {
    setReplaceFileError('');
    if (!selected) {
      setReplaceFile(null);
      setReplaceFileData('');
      return;
    }

    const MAX_SIZE = 25 * 1024 * 1024; // 25 MB
    if (selected.size > MAX_SIZE) {
      setReplaceFileError(`File size (${(selected.size / (1024 * 1024)).toFixed(2)} MB) exceeds the 25 MB maximum limit.`);
      setReplaceFile(null);
      setReplaceFileData('');
      return;
    }

    setReplaceFile(selected);
    setReplaceFileData('');
    setIsReadingReplaceFile(true);
    setReplaceReadProgress(0);
    setReplaceOcrScanResult(null);
    setReplaceScanError('');
    setReplaceUploadProgress(0);
    setReplaceUploadEtaSeconds(null);
    const reader = new FileReader();
    reader.onprogress = (ev) => {
      if (ev.lengthComputable) setReplaceReadProgress(Math.round((ev.loaded / ev.total) * 100));
    };
    reader.onload = () => {
      if (typeof reader.result === 'string') setReplaceFileData(reader.result);
      setIsReadingReplaceFile(false);
      setReplaceReadProgress(100);
    };
    reader.onerror = () => {
      setReplaceFileError('Could not read that file. Please try selecting it again.');
      setReplaceFile(null);
      setReplaceFileData('');
      setIsReadingReplaceFile(false);
    };
    reader.readAsDataURL(selected);
  };

  const handleReplaceFileSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!selectedDesign || !user) return;
    if (isReadingReplaceFile) {
      setReplaceFileError('Still preparing the file — please wait a moment and try again.');
      return;
    }
    if (!replaceFile || !replaceFileData.startsWith('data:')) {
      setReplaceFileError('Select a replacement file first.');
      return;
    }

    setIsReplacingFile(true);
    setReplaceFileError('');
    setReplaceUploadProgress(0);
    setReplaceUploadEtaSeconds(null);
    try {
      const tracker = createProgressTracker((pct, eta) => { setReplaceUploadProgress(pct); setReplaceUploadEtaSeconds(eta); });
      const updated = await updateDesignFile(
        selectedDesign.id,
        replaceFileData,
        replaceFile.name,
        replaceFile.size,
        replaceFile.type || 'application/octet-stream',
        user.name,
        replaceOcrScanResult || undefined,
        tracker
      );
      if (updated) {
        setSelectedDesign(updated);
        setDesigns(getDesigns());
        setReplaceFile(null);
        setReplaceFileData('');
        setReplaceOcrScanResult(null);
        setReplaceScanError('');
        setReplaceUploadProgress(0);
        setReplaceUploadEtaSeconds(null);
      }
    } catch (err: any) {
      setReplaceFileError(err.message || 'Failed to replace file.');
    } finally {
      setIsReplacingFile(false);
    }
  };

  const refreshData = () => {
    setDesigns(getDesigns());
    setMembers(getMembers());
    setEvents(getEvents());
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

    const params = new URLSearchParams(window.location.search);
    setHighlightDesignId(params.get('highlight'));

    const handleSync = () => refreshData();
    window.addEventListener('leads-data-sync', handleSync);
    return () => window.removeEventListener('leads-data-sync', handleSync);
  }, []);

  // Once the highlighted design has actually loaded, open its Inspector — retries on
  // every refresh until found, since it may not exist locally yet on first paint.
  useEffect(() => {
    if (!highlightDesignId || hasOpenedHighlight) return;
    const match = designs.find(d => d.id === highlightDesignId);
    if (match) {
      openInspector(match);
      setHasOpenedHighlight(true);
    }
  }, [designs, highlightDesignId, hasOpenedHighlight]);

  // Handle file selection (from either the dropzone's click-browse or an
  // actual drag-and-drop) with a 25 MB limit check
  const handleFile = (selected: File | undefined) => {
    setFileError('');
    if (!selected) {
      setFile(null);
      setFileData('');
      return;
    }

    const MAX_SIZE = 25 * 1024 * 1024; // 25 MB
    if (selected.size > MAX_SIZE) {
      setFileError(`File size (${(selected.size / (1024 * 1024)).toFixed(2)} MB) exceeds the 25 MB maximum limit.`);
      setFile(null);
      setFileData('');
      return;
    }

    setFile(selected);
    setFileData('');
    setIsReadingFile(true);
    setReadProgress(0);
    setOcrScanResult(null);
    setScanError('');
    setSubmitError('');
    setUploadProgress(0);
    setUploadEtaSeconds(null);

    // Convert file to base64 DataURL for storage & preview. This can take a
    // moment for a large PNG/PDF, so it's tracked as its own progress step —
    // submitting before it finishes used to silently create a design with no
    // file attached, since fileData was still the empty string at that point.
    const reader = new FileReader();
    reader.onprogress = (ev) => {
      if (ev.lengthComputable) setReadProgress(Math.round((ev.loaded / ev.total) * 100));
    };
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setFileData(reader.result);
      }
      setIsReadingFile(false);
      setReadProgress(100);
    };
    reader.onerror = () => {
      setFileError('Could not read that file. Please try selecting it again.');
      setFile(null);
      setFileData('');
      setIsReadingFile(false);
    };
    reader.readAsDataURL(selected);
  };

  const runOcrScan = async (
    dataUrl: string,
    fileType: string,
    setResult: (r: OcrScanResult | null) => void,
    setScanning: (b: boolean) => void,
    setError: (s: string) => void
  ) => {
    setScanning(true);
    setError('');
    setResult(null);
    try {
      const res = await fetch('/api/designs/ocr-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileData: dataUrl, fileType }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'OCR scan failed.');
      setResult(body as OcrScanResult);
    } catch (err: any) {
      setError(err.message || 'OCR scan failed. You can still submit without scanning.');
    } finally {
      setScanning(false);
    }
  };

  const handleScanFile = () => {
    if (!file || !fileData.startsWith('data:')) return;
    setShowExtractedText(false);
    runOcrScan(fileData, file.type || 'application/octet-stream', setOcrScanResult, setIsScanning, setScanError);
  };

  const handleScanReplaceFile = () => {
    if (!replaceFile || !replaceFileData.startsWith('data:')) return;
    runOcrScan(replaceFileData, replaceFile.type || 'application/octet-stream', setReplaceOcrScanResult, setIsScanningReplace, setReplaceScanError);
  };

  const handleUploadSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!title.trim()) return;
    if (!file) {
      setFileError('Please select a design asset to upload.');
      return;
    }
    if (isReadingFile) {
      setFileError('Still preparing the file — please wait a moment and try again.');
      return;
    }
    if (!fileData.startsWith('data:')) {
      setFileError('The file did not load correctly. Please re-select it and try again.');
      return;
    }

    setIsSubmitting(true);
    setSubmitError('');
    setUploadProgress(0);
    setUploadEtaSeconds(null);
    try {
      const selectedEvent = events.find(ev => ev.id === eventId);
      const tracker = createProgressTracker((pct, eta) => { setUploadProgress(pct); setUploadEtaSeconds(eta); });

      await addDesign({
        title: title.trim(),
        description: description.trim(),
        category,
        fileData,
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type || 'application/octet-stream',
        designerId: user?.id || 'guest',
        designerName: user?.name || 'Designer',
        designerEmail: user?.email || 'designer@msruas.ac.in',
        // proofreadRequested/assignedProofreader* are always overridden by
        // addDesign() itself (see resolveDesignReviewer) — proofreading is
        // mandatory and auto-routed, never opt-in or manually picked here.
        proofreadRequested: true,
        eventId: selectedEvent?.id,
        eventName: selectedEvent?.title,
        ocrScan: ocrScanResult || undefined,
      }, tracker);

      refreshData();
      setShowUploadModal(false);

      // Reset form
      setTitle('');
      setDescription('');
      setCategory('Poster');
      setEventId('');
      setFile(null);
      setFileData('');
      setFileError('');
      setOcrScanResult(null);
      setScanError('');
      setUploadProgress(0);
      setUploadEtaSeconds(null);
    } catch (err: any) {
      // Deliberately doesn't close the modal or reset the form on failure —
      // the file is still selected, so the designer can just hit Submit again.
      setSubmitError(err.message || 'Failed to submit design.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveReview = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDesign) return;

    updateDesignReview(
      selectedDesign.id,
      reviewStatus,
      reviewComments.trim(),
      user?.name || 'Proofreader'
    );

    refreshData();
    setShowInspectorModal(false);
    setSelectedDesign(null);
    setReviewComments('');
  };

  const handleDelete = (id: string, name: string) => {
    if (confirm(`Are you sure you want to delete "${name}"?`)) {
      deleteDesign(id, user?.name || 'User');
      refreshData();
      if (selectedDesign?.id === id) {
        setShowInspectorModal(false);
        setSelectedDesign(null);
      }
    }
  };

  // Helper for retention calculation
  const getDaysRemaining = (expiresAtStr: string) => {
    const expiresMs = new Date(expiresAtStr).getTime();
    const nowMs = new Date().getTime();
    const diffDays = Math.ceil((expiresMs - nowMs) / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  // Filtered designs
  const filteredDesigns = designs.filter(d => {
    // Search
    const matchesSearch = 
      d.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.designerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (d.eventName && d.eventName.toLowerCase().includes(searchQuery.toLowerCase()));
    if (!matchesSearch) return false;

    // Category
    if (categoryFilter !== 'all' && d.category !== categoryFilter) return false;

    // Tabs
    if (activeTab === 'mine') {
      return d.designerEmail === user?.email;
    }
    if (activeTab === 'proofread') {
      return d.assignedProofreaderEmail === user?.email || canViewAllDesigns(user);
    }
    if (activeTab === 'expired') {
      return d.isExpired;
    }

    // Default "all" tab: plain designers only see their own + anything assigned to them
    if (!canViewAllDesigns(user)) {
      return d.designerEmail === user?.email || d.assignedProofreaderEmail === user?.email;
    }

    return true;
  });

  // Metrics
  const totalSubmissions = designs.length;
  const pendingProofreads = designs.filter(d => d.proofreadRequested && d.review?.status === 'Pending Proofread').length;
  const approvedDesigns = designs.filter(d => d.review?.status === 'Proofread Approved').length;
  const expiredCount = designs.filter(d => d.isExpired).length;
  const assignedToMeCount = designs.filter(d => d.proofreadRequested && d.assignedProofreaderEmail === user?.email && d.review?.status === 'Pending Proofread').length;

  return (
    <div className="p-6 md:p-8 space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 glass-panel border border-white/30 p-6 md:p-8 rounded-3xl shadow-xl bg-gradient-to-r from-accent/15 via-primary/10 to-transparent">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-2xl bg-accent/20 border border-accent/30 text-accent">
              <Palette className="h-6 w-6" />
            </div>
            <h1 className="text-2xl font-black tracking-tight text-theme-text-primary">Design Portal & Proofreading Hub</h1>
          </div>
          <p className="text-xs text-theme-text-secondary">
            Submit event artwork, posters & media assets (Max <span className="font-bold text-theme-text-primary">25 MB</span>). Automatic <span className="font-bold text-theme-text-primary">30-day server retention policy</span>. Request peer & faculty proofreading.
          </p>
        </div>
        <button
          onClick={() => { setSubmitError(''); setShowUploadModal(true); }}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-accent hover:bg-primary-light text-white font-bold text-xs transition-all shadow-md shadow-accent/20 whitespace-nowrap cursor-pointer"
        >
          <UploadCloud className="h-4 w-4" />
          Submit Design Asset
        </button>
      </div>

      {/* Metrics Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="glass-panel p-4 rounded-2xl space-y-1 border border-white/20">
          <div className="flex items-center justify-between text-xs text-theme-text-secondary">
            <span className="font-semibold">Total Submissions</span>
            <FileText className="h-4 w-4 text-accent" />
          </div>
          <p className="text-2xl font-black text-theme-text-primary">{totalSubmissions}</p>
          <p className="text-[11px] text-theme-text-secondary">Active in portal</p>
        </div>

        <div className="glass-panel p-4 rounded-2xl space-y-1 border border-white/20">
          <div className="flex items-center justify-between text-xs text-theme-text-secondary">
            <span className="font-semibold">Pending Proofread</span>
            <Clock className="h-4 w-4 text-amber-500" />
          </div>
          <p className="text-2xl font-black text-amber-600 dark:text-amber-400">{pendingProofreads}</p>
          <p className="text-[11px] text-theme-text-secondary">{assignedToMeCount} assigned to you</p>
        </div>

        <div className="glass-panel p-4 rounded-2xl space-y-1 border border-white/20">
          <div className="flex items-center justify-between text-xs text-theme-text-secondary">
            <span className="font-semibold">Proofread Approved</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </div>
          <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400">{approvedDesigns}</p>
          <p className="text-[11px] text-theme-text-secondary">Ready for print & pub</p>
        </div>

        <div className="glass-panel p-4 rounded-2xl space-y-1 border border-white/20">
          <div className="flex items-center justify-between text-xs text-theme-text-secondary">
            <span className="font-semibold">30-Day Retention Policy</span>
            <ShieldAlert className="h-4 w-4 text-rose-500" />
          </div>
          <p className="text-2xl font-black text-theme-text-secondary">{expiredCount}</p>
          <p className="text-[11px] text-theme-text-secondary">Files purged & archived</p>
        </div>
      </div>

      {/* Filter Tabs & Search Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 glass-panel p-3 rounded-2xl border border-white/20">
        {/* Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
          <button
            onClick={() => setActiveTab('all')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
              activeTab === 'all'
                ? 'bg-accent text-white shadow-md shadow-accent/20'
                : 'text-theme-text-secondary hover:bg-white/40 dark:hover:bg-white/5 hover:text-theme-text-primary'
            }`}
          >
            All Submissions
          </button>

          <button
            onClick={() => setActiveTab('mine')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
              activeTab === 'mine'
                ? 'bg-accent text-white shadow-md shadow-accent/20'
                : 'text-theme-text-secondary hover:bg-white/40 dark:hover:bg-white/5 hover:text-theme-text-primary'
            }`}
          >
            My Submissions
          </button>

          <button
            onClick={() => setActiveTab('proofread')}
            className={`relative px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
              activeTab === 'proofread'
                ? 'bg-accent text-white shadow-md shadow-accent/20'
                : 'text-theme-text-secondary hover:bg-white/40 dark:hover:bg-white/5 hover:text-theme-text-primary'
            }`}
          >
            Proofreading Desk
            {assignedToMeCount > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] bg-amber-500 text-slate-950 font-black">
                {assignedToMeCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('expired')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
              activeTab === 'expired'
                ? 'bg-accent text-white shadow-md shadow-accent/20'
                : 'text-theme-text-secondary hover:bg-white/40 dark:hover:bg-white/5 hover:text-theme-text-primary'
            }`}
          >
            30d Expired ({expiredCount})
          </button>
        </div>

        {/* Search & Category Filter */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-theme-text-secondary" />
            <input
              type="text"
              placeholder="Search design title..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl bg-white/40 dark:bg-white/5 border border-theme-border/30 text-theme-text-primary placeholder:text-theme-text-secondary focus:outline-none focus:border-accent"
            />
          </div>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-1.5 text-xs rounded-xl bg-white/40 dark:bg-white/5 border border-theme-border/30 text-theme-text-primary focus:outline-none focus:border-accent cursor-pointer"
          >
            <option value="ALL">All Categories</option>
            <option value="Poster">Poster</option>
            <option value="Banner">Banner</option>
            <option value="Social Media Post">Social Media Post</option>
            <option value="ID Card / Certificate">ID Card / Certificate</option>
            <option value="Brochure">Brochure</option>
            <option value="Other">Other</option>
          </select>
        </div>
      </div>

      {/* Design Grid & Empty State */}
      {filteredDesigns.length === 0 ? (
        <div className="glass-panel rounded-3xl p-12 text-center space-y-4 border border-white/20">
          <div className="mx-auto w-12 h-12 rounded-full bg-accent/15 flex items-center justify-center text-accent">
            <Palette className="h-6 w-6" />
          </div>
          <h3 className="text-base font-bold text-theme-text-primary">No design submissions found</h3>
          <p className="text-xs text-theme-text-secondary max-w-sm mx-auto">
            Be the first to submit a design asset for proofreading and approval!
          </p>
          <button
            onClick={() => { setSubmitError(''); setShowUploadModal(true); }}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-accent hover:bg-primary-light text-white text-xs font-bold transition-all shadow-md shadow-accent/20 cursor-pointer"
          >
            <UploadCloud className="h-4 w-4" />
            Upload Design
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredDesigns.map(design => {
            const daysRemaining = getDaysRemaining(design.expiresAt);
            const isAssignedToMe = design.assignedProofreaderEmail === user?.email;

            return (
              <div
                key={design.id}
                className="group glass-panel rounded-2xl overflow-hidden hover:border-accent/50 transition-all shadow-md flex flex-col justify-between border border-white/20"
              >
                <div>
                  {/* Top Asset Preview Header */}
                  <div className="relative h-44 bg-white/40 dark:bg-white/5 border-b border-theme-border/20 flex items-center justify-center overflow-hidden">
                    {(design.fileUrl || design.fileData) && design.fileType.startsWith('image/') ? (
                      <img
                        src={design.fileUrl || design.fileData}
                        alt={design.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="flex flex-col items-center gap-2 text-theme-text-secondary">
                        <FileText className="h-10 w-10 text-accent/80" />
                        <span className="text-xs font-mono font-medium max-w-[200px] truncate px-2 text-center">
                          {design.fileName}
                        </span>
                      </div>
                    )}

                    {/* Category Pill */}
                    <span className="absolute top-3 left-3 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-white/90 dark:bg-slate-900/90 backdrop-blur border border-theme-border/30 text-theme-text-primary">
                      {design.category}
                    </span>

                    {/* 30-Day Retention Badge */}
                    <span
                      className={`absolute top-3 right-3 px-2.5 py-0.5 rounded-full text-[10px] font-bold backdrop-blur border ${
                        design.isExpired || daysRemaining <= 0
                          ? 'bg-rose-500/20 text-rose-600 dark:text-rose-400 border-rose-500/40'
                          : daysRemaining <= 5
                          ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/40'
                          : 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/40'
                      }`}
                    >
                      {design.isExpired || daysRemaining <= 0
                        ? '30d Expired (Purged)'
                        : `Expires in ${daysRemaining}d`}
                    </span>
                  </div>

                  {/* Body Content */}
                  <div className="p-4 space-y-3">
                    <div className="space-y-1">
                      <h3 className="font-bold text-sm text-theme-text-primary line-clamp-1 group-hover:text-accent transition-colors">
                        {design.title}
                      </h3>
                      {design.description && (
                        <p className="text-xs text-theme-text-secondary line-clamp-2">
                          {design.description}
                        </p>
                      )}
                    </div>

                    {/* Metadata Specs */}
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-theme-text-secondary">
                      <span className="font-mono bg-white/50 dark:bg-white/5 px-2 py-0.5 rounded border border-theme-border/30 font-semibold">
                        {(design.fileSize / (1024 * 1024)).toFixed(2)} MB / 25 MB
                      </span>

                      {design.eventName && (
                        <span className="flex items-center gap-1 text-accent truncate max-w-[160px] font-semibold">
                          <Calendar className="h-3 w-3 shrink-0" />
                          {design.eventName}
                        </span>
                      )}
                    </div>

                    {/* Proofreading Status Box */}
                    <div className="pt-2 border-t border-theme-border/30">
                      {design.proofreadRequested ? (
                        <div className="flex items-start justify-between gap-2">
                          <div className="space-y-0.5">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-theme-text-secondary block">
                              Proofreading Status
                            </span>

                            {design.review?.status === 'Proofread Approved' ? (
                              <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                Approved
                              </span>
                            ) : design.review?.status === 'Changes Requested' ? (
                              <span className="inline-flex items-center gap-1 text-xs font-bold text-rose-600 dark:text-rose-400">
                                <AlertCircle className="h-3.5 w-3.5" />
                                Changes Requested
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-600 dark:text-amber-400">
                                <Clock className="h-3.5 w-3.5" />
                                Pending Proofread
                              </span>
                            )}
                          </div>

                          <div className="text-right">
                            <span className="text-[10px] font-semibold text-theme-text-secondary block">Assigned Proofreader</span>
                            <span className="text-xs font-bold text-theme-text-primary truncate max-w-[120px] block">
                              {design.assignedProofreaderName || 'Unassigned'}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-theme-text-secondary italic flex items-center gap-1">
                          <FileCheck className="h-3 w-3" /> No Proofreading Requested
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Footer Buttons */}
                <div className="p-4 pt-0 flex items-center justify-between gap-2 border-t border-theme-border/20 mt-2">
                  <div className="text-[11px] text-theme-text-secondary">
                    By <span className="font-bold text-theme-text-primary">{design.designerName}</span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {isAssignedToMe && design.review?.status === 'Pending Proofread' && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-black bg-amber-500 text-slate-950 animate-pulse">
                        Action Required
                      </span>
                    )}

                    <button
                      onClick={() => openInspector(design)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-accent text-white hover:bg-primary-light text-xs font-bold transition-all shadow-sm cursor-pointer"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      Inspect & Review
                    </button>

                    {(design.designerEmail === user?.email || user?.tier <= 3 || hasCapability(user, 'DESIGN_DELETE')) && (
                      <button
                        onClick={() => handleDelete(design.id, design.title)}
                        className="p-1.5 rounded-xl text-theme-text-secondary hover:text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer"
                        title="Delete design"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
          <div className="glass-panel bg-slate-900/95 dark:bg-[#0B1B2E]/95 bg-white/95 backdrop-blur-2xl border border-white/20 dark:border-white/15 rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl relative">
            <button
              onClick={() => setShowUploadModal(false)}
              className="absolute top-4 right-4 text-muted-foreground hover:text-foreground"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="space-y-1">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <UploadCloud className="h-5 w-5 text-accent" />
                Submit Design Asset
              </h2>
              <p className="text-xs text-muted-foreground">
                Upload your graphic asset (<span className="font-semibold">Max 25 MB</span>). Files are stored for <span className="font-semibold">30 days</span> under automatic retention policy.
              </p>
            </div>

            <form onSubmit={handleUploadSubmit} className="space-y-4 text-xs">
              {/* Title */}
              <div className="space-y-1">
                <label className="font-medium text-foreground">Design Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Tech Conclave Main Stage Banner"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>

              {/* Category & Event */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-medium text-foreground">Category *</label>
                  <select
                    value={category}
                    onChange={e => setCategory(e.target.value as any)}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-accent"
                  >
                    <option value="Poster">Poster</option>
                    <option value="Banner">Banner</option>
                    <option value="Social Media">Social Media</option>
                    <option value="Brochure">Brochure</option>
                    <option value="Certificates">Certificates</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="font-medium text-foreground">Tag Event (Optional)</label>
                    <button
                      type="button"
                      onClick={() => {
                        setQuickEventError('');
                        setShowQuickEventModal(true);
                      }}
                      className="text-[11px] text-accent hover:underline font-semibold flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="h-3 w-3" />
                      Create Event on Spot
                    </button>
                  </div>
                  <select
                    value={eventId}
                    onChange={e => setEventId(e.target.value)}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-accent"
                  >
                    <option value="">-- No Specific Event --</option>
                    {events.filter(ev => isApprovedEvent(ev, tasks)).map(ev => (
                      <option key={ev.id} value={ev.id}>{ev.title}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Description */}
              <div className="space-y-1">
                <label className="font-medium text-foreground">Description & Notes</label>
                <textarea
                  rows={2}
                  placeholder="Provide context, dimensions, or target printing specs..."
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>

              {/* File Upload Box */}
              <div className="space-y-1">
                <label className="font-medium text-foreground flex items-center justify-between">
                  <span>File Asset (<span className="text-amber-500 font-bold">&lt; 25 MB</span>) *</span>
                </label>

                <FileDropzone
                  onFilesSelected={(files) => handleFile(files[0])}
                  accept="image/*,video/*,application/pdf,.psd,.ai,.eps,.svg,.indd,.cdr,.ppt,.pptx,.doc,.docx,.zip"
                  label="Click to select design file"
                  hint="Images, video, PDF, PSD, AI, PPTX, DOCX & more — up to 25 MB"
                  disabled={isSubmitting}
                />

                {file && (
                  <div className="pt-1">
                    <FilePreviewRow
                      file={file}
                      status={isSubmitting ? 'uploading' : submitError ? 'error' : 'idle'}
                      progress={uploadProgress}
                      etaSeconds={uploadEtaSeconds}
                      error={submitError}
                      onRetry={submitError ? () => handleUploadSubmit() : undefined}
                    />
                  </div>
                )}

                {isReadingFile && (
                  <div className="space-y-1 pt-1">
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>Preparing file...</span>
                      <span className="font-mono">{readProgress}%</span>
                    </div>
                    <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-accent transition-all duration-150 ease-out"
                        style={{ width: `${readProgress}%` }}
                      />
                    </div>
                  </div>
                )}

                {fileError && (
                  <p className="text-rose-500 font-medium text-[11px] flex items-center gap-1 pt-1">
                    <AlertCircle className="h-3.5 w-3.5" />
                    {fileError}
                  </p>
                )}

                {file && !isReadingFile && fileData.startsWith('data:') && (
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={handleScanFile}
                      disabled={isScanning}
                      className="w-full py-2 rounded-lg bg-muted border border-border text-foreground font-medium hover:bg-muted/70 text-xs flex items-center justify-center gap-1.5 disabled:opacity-60 cursor-pointer disabled:cursor-not-allowed"
                    >
                      <Search className="h-3.5 w-3.5" />
                      {isScanning ? 'Scanning for typos... this can take a while for multi-page PDFs' : 'Scan for Typos & Spelling'}
                    </button>
                    <OcrScanPanel
                      result={ocrScanResult}
                      error={scanError}
                      showExtractedText={showExtractedText}
                      onToggleExtractedText={() => setShowExtractedText(v => !v)}
                    />
                  </div>
                )}
              </div>

              {/* Mandatory Proofreading Notice — every design, regardless of
                  category, is automatically routed to the Centre Head or the
                  GG Campus Events Head for a required proofread. There is no
                  opt-out and no manual reviewer picker; this is purely
                  informational. */}
              <div className="p-3.5 bg-muted/40 border border-border rounded-xl space-y-1.5">
                <div className="flex items-center gap-2 font-semibold text-foreground">
                  <MessageSquare className="h-4 w-4 text-accent" />
                  Mandatory Proofreading
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Every design, regardless of category, is automatically sent to{' '}
                  <strong className="text-foreground">{mandatoryReviewer?.name || 'the Centre Head'}</strong>{' '}
                  for required proofreading before it can be approved — this cannot be skipped or reassigned.
                </p>
              </div>

              {/* Real upload percent + ETA and retry now live inline on the
                  FilePreviewRow above — no separate indeterminate bar or
                  duplicate error banner needed here. */}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  className="px-4 py-2 rounded-lg bg-muted text-muted-foreground hover:text-foreground font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || isReadingFile}
                  className="px-4 py-2 rounded-xl bg-accent text-white font-bold hover:bg-primary-light transition-all shadow-md shadow-accent/20 disabled:opacity-50 cursor-pointer"
                >
                  {isSubmitting ? 'Uploading...' : isReadingFile ? 'Preparing file...' : submitError ? 'Retry Submit' : 'Submit Design'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Quick Event Creation Modal */}
      {showQuickEventModal && (
        <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
          <div className="glass-panel bg-slate-900/95 dark:bg-[#0B1B2E]/95 bg-white/95 backdrop-blur-2xl border border-white/20 dark:border-white/15 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl relative text-foreground">
            <button
              onClick={() => setShowQuickEventModal(false)}
              className="absolute top-4 right-4 text-muted-foreground hover:text-foreground"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="space-y-1">
              <h3 className="text-base font-bold flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-accent" />
                Create Event on the Spot
              </h3>
              <p className="text-xs text-muted-foreground">
                Create a new event immediately to tag your design asset.
              </p>
            </div>

            <form onSubmit={handleQuickEventSubmit} className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="font-medium text-foreground">Event Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Annual Tech Symposium 2026"
                  value={newEventTitle}
                  onChange={e => setNewEventTitle(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>

              <div className="space-y-1">
                <label className="font-medium text-foreground">Campus</label>
                <select
                  value={newEventCampus}
                  onChange={e => setNewEventCampus(e.target.value as any)}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-accent"
                >
                  <option value="GG Campus">GG Campus</option>
                  <option value="RTC Campus">RTC Campus</option>
                  <option value="Both Campuses">Both Campuses</option>
                </select>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="font-medium text-foreground">Dates</label>
                  <label className="flex items-center gap-1.5 cursor-pointer text-[11px] text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={newEventDatesTBD}
                      onChange={e => setNewEventDatesTBD(e.target.checked)}
                      className="rounded border-border text-accent focus:ring-accent"
                    />
                    Dates TBD
                  </label>
                </div>
                {!newEventDatesTBD && (
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="date"
                      value={newEventStartDate}
                      onChange={e => setNewEventStartDate(e.target.value)}
                      className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-accent text-xs"
                    />
                    <input
                      type="date"
                      value={newEventEndDate}
                      onChange={e => setNewEventEndDate(e.target.value)}
                      className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-accent text-xs"
                    />
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <label className="font-medium text-foreground">Location / Venue</label>
                <input
                  type="text"
                  placeholder="e.g. Main Auditorium"
                  value={newEventLocation}
                  onChange={e => setNewEventLocation(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>

              <div className="space-y-1">
                <label className="font-medium text-foreground">Description</label>
                <textarea
                  rows={2}
                  placeholder="Event notes or objectives..."
                  value={newEventDesc}
                  onChange={e => setNewEventDesc(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>

              {quickEventError && (
                <p className="text-rose-500 font-medium text-[11px] flex items-center gap-1">
                  <AlertCircle className="h-3.5 w-3.5" />
                  {quickEventError}
                </p>
              )}

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowQuickEventModal(false)}
                  className="px-3 py-1.5 rounded-lg border border-border text-foreground hover:bg-muted font-medium text-xs cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreatingEvent}
                  className="px-4 py-2 rounded-xl bg-accent text-white font-bold hover:bg-primary-light text-xs flex items-center gap-1.5 disabled:opacity-50 cursor-pointer shadow-md shadow-accent/20 transition-all"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  {isCreatingEvent ? 'Creating...' : 'Create & Tag Event'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Design Inspector & Proofreader Review Modal */}
      {showInspectorModal && selectedDesign && (
        <div
          onClick={() => {
            setShowInspectorModal(false);
            setSelectedDesign(null);
          }}
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="glass-panel bg-slate-900/95 dark:bg-[#0B1B2E]/95 bg-white/95 backdrop-blur-2xl border border-white/20 dark:border-white/15 rounded-2xl max-w-2xl w-full p-6 space-y-6 shadow-2xl relative max-h-[90vh] overflow-y-auto flex flex-col"
          >
            <div className="sticky -top-6 -mx-6 -mt-6 p-6 bg-slate-900/95 dark:bg-[#0B1B2E]/95 bg-white/95 backdrop-blur-xl border-b border-border z-30 flex items-start justify-between gap-4 rounded-t-2xl">
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-accent/10 text-accent border border-accent/20">
                    {selectedDesign.category}
                  </span>
                  <h2 className="text-lg font-bold">{selectedDesign.title}</h2>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Submitted by <span className="font-semibold text-foreground">{selectedDesign.designerName}</span> ({selectedDesign.designerEmail})
                </p>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <div className="text-right hidden sm:block">
                  <span className="text-[11px] font-mono bg-muted px-2 py-0.5 rounded border border-border inline-block">
                    {(selectedDesign.fileSize / (1024 * 1024)).toFixed(2)} MB / 25 MB
                  </span>
                  <span className="text-[10px] text-muted-foreground block">
                    Exp: {selectedDesign.expiresAt.split('T')[0]}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowInspectorModal(false);
                    setSelectedDesign(null);
                  }}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-muted hover:bg-muted/80 text-foreground text-xs font-semibold transition-all border border-border cursor-pointer shadow-sm"
                  title="Close Inspector"
                >
                  <X className="h-4 w-4" />
                  <span>Close</span>
                </button>
              </div>
            </div>

            {/* Asset Preview Frame */}
            <div className="bg-muted/40 border border-border rounded-xl p-4 text-center space-y-3">
              {(selectedDesign.fileUrl || selectedDesign.fileData) && selectedDesign.fileType.startsWith('image/') ? (
                <div className="max-h-72 overflow-hidden rounded-lg border border-border mx-auto flex items-center justify-center">
                  <img
                    src={selectedDesign.fileUrl || selectedDesign.fileData}
                    alt={selectedDesign.title}
                    className="max-h-72 object-contain"
                  />
                </div>
              ) : selectedDesign.isExpired ? (
                <div className="py-8 space-y-2 text-rose-400">
                  <ShieldAlert className="h-10 w-10 mx-auto" />
                  <p className="font-bold text-sm">File Payload Purged under 30-Day Retention Policy</p>
                  <p className="text-xs text-muted-foreground">
                    This file exceeded the 30-day storage period. Metadata is preserved for audit trail.
                  </p>
                </div>
              ) : (
                <div className="py-8 space-y-2 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto text-accent" />
                  <p className="font-medium text-sm text-foreground">{selectedDesign.fileName}</p>
                  <p className="text-xs">{selectedDesign.fileType}</p>
                </div>
              )}

              {(selectedDesign.fileUrl || selectedDesign.fileData) && (
                <a
                  href={selectedDesign.fileUrl ? `${selectedDesign.fileUrl}?download=1` : selectedDesign.fileData}
                  download={selectedDesign.fileName}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-background border border-border text-xs font-medium text-foreground hover:bg-muted"
                >
                  <Download className="h-3.5 w-3.5" /> Download Full Resolution File
                </a>
              )}
            </div>

            {/* Replace File (design owner or admins only) */}
            {(selectedDesign.designerEmail === user?.email || canViewAllDesigns(user)) && (
              <form onSubmit={handleReplaceFileSubmit} className="border-t border-border pt-4 space-y-3">
                <h3 className="text-sm font-bold flex items-center gap-2">
                  <UploadCloud className="h-4 w-4 text-accent" />
                  Replace Uploaded File
                </h3>
                <p className="text-xs text-muted-foreground">
                  Uploading a new file resets any proofread or style decision back to pending, since the reviewed asset no longer exists.
                </p>
                <FileDropzone
                  onFilesSelected={(files) => handleReplaceFile(files[0])}
                  label="Click to select replacement file"
                  hint="Up to 25 MB"
                  disabled={isReplacingFile}
                  compact
                />

                {replaceFile && (
                  <FilePreviewRow
                    file={replaceFile}
                    status={isReplacingFile ? 'uploading' : replaceFileError ? 'error' : 'idle'}
                    progress={replaceUploadProgress}
                    etaSeconds={replaceUploadEtaSeconds}
                    error={replaceFileError}
                    onRetry={replaceFileError ? () => handleReplaceFileSubmit() : undefined}
                    onRemove={!isReplacingFile ? () => handleReplaceFile(undefined) : undefined}
                  />
                )}

                <button
                  type="submit"
                  disabled={isReplacingFile || isReadingReplaceFile || !replaceFile}
                  className="w-full px-4 py-2.5 rounded-xl bg-accent text-white font-bold hover:bg-primary-light text-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap shadow-md shadow-accent/20 transition-all"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isReplacingFile || isReadingReplaceFile ? 'animate-spin' : ''}`} />
                  {isReplacingFile ? 'Uploading New File...' : isReadingReplaceFile ? 'Reading file...' : 'Upload Revised File'}
                </button>
                {isReadingReplaceFile && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                      <span>Preparing file...</span>
                      <span className="font-mono">{replaceReadProgress}%</span>
                    </div>
                    <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-accent transition-all duration-150 ease-out"
                        style={{ width: `${replaceReadProgress}%` }}
                      />
                    </div>
                  </div>
                )}
                {replaceFile && !isReadingReplaceFile && replaceFileData.startsWith('data:') && (
                  <div>
                    <button
                      type="button"
                      onClick={handleScanReplaceFile}
                      disabled={isScanningReplace}
                      className="w-full py-2 rounded-lg bg-muted border border-border text-foreground font-medium hover:bg-muted/70 text-xs flex items-center justify-center gap-1.5 disabled:opacity-60 cursor-pointer disabled:cursor-not-allowed"
                    >
                      <Search className="h-3.5 w-3.5" />
                      {isScanningReplace ? 'Scanning for typos...' : 'Scan for Typos & Spelling'}
                    </button>
                    <OcrScanPanel
                      result={replaceOcrScanResult}
                      error={replaceScanError}
                      showExtractedText={showExtractedText}
                      onToggleExtractedText={() => setShowExtractedText(v => !v)}
                    />
                  </div>
                )}
              </form>
            )}

            {/* Task & Performance Rating Integration Status Card */}
            {selectedDesign.linkedTaskId && (
              <div className="bg-accent/10 border border-accent/20 p-3.5 rounded-xl space-y-1 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-foreground flex items-center gap-1.5">
                    <CheckSquare className="h-4 w-4 text-accent" />
                    Task & Rating Workflow Integration
                  </span>
                  {(() => {
                    const linkedTask = tasks.find(t => t.id === selectedDesign.linkedTaskId);
                    if (linkedTask?.ratingScore) {
                      return (
                        <span className="flex items-center gap-1 font-bold text-amber-500 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full text-[10px]">
                          <Star className="h-3 w-3 fill-amber-500" /> Rated {linkedTask.ratingScore.toFixed(1)}/5.0
                        </span>
                      );
                    }
                    return (
                      <span className="font-bold text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full text-[10px]">
                        Task Registered — Ready for Rating
                      </span>
                    );
                  })()}
                </div>
                <p className="text-muted-foreground text-[11px]">
                  This finalized design deliverable is active as a task assigned to <strong className="text-foreground">{selectedDesign.designerName}</strong>
                  {selectedDesign.eventName ? ` for event "${selectedDesign.eventName}"` : ' (Standalone Deliverable)'}. Evaluators can score performance under the <strong>Ratings</strong> tab.
                </p>
              </div>
            )}

            {/* Automated 3-Stage Social Media Workflow Tracker Card */}
            {(selectedDesign.styleStatus === 'Style Approved' || selectedDesign.workflowStage) && (
              <div className="bg-slate-900/60 dark:bg-slate-900/80 bg-slate-50 border border-accent/30 p-5 rounded-2xl space-y-4 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-foreground flex items-center gap-2 text-sm">
                    <Send className="h-4.5 w-4.5 text-accent" />
                    Automated 3-Stage Social Media Workflow
                  </span>
                  <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                    selectedDesign.workflowStage === 'completed'
                      ? 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/20'
                      : 'bg-accent/15 text-accent border border-accent/20'
                  }`}>
                    {selectedDesign.workflowStage === 'completed' ? '✨ Workflow Completed' : `Stage: ${selectedDesign.workflowStage || 'caption_required'}`}
                  </span>
                </div>

                {/* Stepper Progress Bar */}
                <div className="grid grid-cols-3 gap-2 text-center text-[11px] pt-1">
                  <div className={`p-2 rounded-xl border font-semibold ${
                    selectedDesign.workflowStage === 'caption_required' || !selectedDesign.workflowStage
                      ? 'bg-accent text-white border-accent'
                      : selectedDesign.workflowStage === 'caption_approval' || selectedDesign.workflowStage === 'posting_required' || selectedDesign.workflowStage === 'completed'
                      ? 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30'
                      : 'bg-muted/40 text-muted-foreground border-border'
                  }`}>
                    1. Draft Captions
                  </div>
                  <div className={`p-2 rounded-xl border font-semibold ${
                    selectedDesign.workflowStage === 'caption_approval'
                      ? 'bg-accent text-white border-accent'
                      : selectedDesign.workflowStage === 'posting_required' || selectedDesign.workflowStage === 'completed'
                      ? 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30'
                      : 'bg-muted/40 text-muted-foreground border-border'
                  }`}>
                    2. Proofreader Approval
                  </div>
                  <div className={`p-2 rounded-xl border font-semibold ${
                    selectedDesign.workflowStage === 'posting_required'
                      ? 'bg-accent text-white border-accent'
                      : selectedDesign.workflowStage === 'completed'
                      ? 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30'
                      : 'bg-muted/40 text-muted-foreground border-border'
                  }`}>
                    3. Post on Social Media
                  </div>
                </div>

                {/* Stage 1: Designer Drafts Captions */}
                {(!selectedDesign.workflowStage || selectedDesign.workflowStage === 'caption_required') && (
                  <form onSubmit={handleSubmitCaptions} className="space-y-3 bg-background/50 p-4 rounded-xl border border-border">
                    <p className="font-semibold text-foreground flex items-center gap-1.5">
                      <Edit2 className="h-3.5 w-3.5 text-accent" />
                      Stage 1: Submit Instagram & LinkedIn Captions (Designer Task)
                    </p>
                    {selectedDesign.captionReviewComments && (
                      <div className="p-2.5 bg-rose-500/10 border border-rose-500/20 text-rose-500 rounded-lg text-[11px]">
                        <strong>Proofreader Revision Notes:</strong> {selectedDesign.captionReviewComments}
                      </div>
                    )}
                    <div className="space-y-1">
                      <label className="font-medium text-foreground">Instagram Caption *</label>
                      <textarea
                        rows={2}
                        required
                        placeholder="Write Instagram caption..."
                        value={instaCaptionInput}
                        onChange={e => setInstaCaptionInput(e.target.value)}
                        className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-accent"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="font-medium text-foreground">LinkedIn Caption</label>
                      <textarea
                        rows={2}
                        placeholder="Write LinkedIn caption (optional if same as IG)..."
                        value={linkedinCaptionInput}
                        onChange={e => setLinkedinCaptionInput(e.target.value)}
                        className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-accent"
                      />
                    </div>
                    <button
                      type="submit"
                      className="w-full py-2.5 rounded-xl bg-accent text-white font-semibold text-xs flex items-center justify-center gap-1.5 hover:bg-primary-light transition-all shadow-md shadow-accent/20 cursor-pointer"
                    >
                      <Send className="h-3.5 w-3.5" />
                      Submit Captions for Proofreader Approval
                    </button>
                  </form>
                )}

                {/* Stage 2: Original Proofreader Approves Captions */}
                {selectedDesign.workflowStage === 'caption_approval' && (
                  <div className="space-y-3 bg-background/50 p-4 rounded-xl border border-border">
                    <p className="font-semibold text-foreground flex items-center gap-1.5">
                      <UserCheck className="h-3.5 w-3.5 text-accent" />
                      Stage 2: Review Draft Captions ({selectedDesign.assignedProofreaderName || 'Proofreader'}&apos;s Task)
                    </p>
                    <div className="space-y-2 text-[11px] bg-muted/30 p-3 rounded-lg border border-border">
                      <div>
                        <span className="font-bold text-foreground">Draft Instagram Caption:</span>
                        <p className="text-muted-foreground whitespace-pre-wrap mt-0.5">{selectedDesign.draftInstagramCaption || 'N/A'}</p>
                      </div>
                      {selectedDesign.draftLinkedinCaption && (
                        <div>
                          <span className="font-bold text-foreground">Draft LinkedIn Caption:</span>
                          <p className="text-muted-foreground whitespace-pre-wrap mt-0.5">{selectedDesign.draftLinkedinCaption}</p>
                        </div>
                      )}
                    </div>

                    {(selectedDesign.assignedProofreaderEmail === user?.email || canViewAllDesigns(user)) ? (
                      <form onSubmit={handleReviewCaptions} className="space-y-3 pt-1">
                        <div className="flex items-center gap-4">
                          <label className="flex items-center gap-2 cursor-pointer font-medium">
                            <input
                              type="radio"
                              name="captionReviewApproved"
                              checked={captionReviewApproved}
                              onChange={() => setCaptionReviewApproved(true)}
                              className="text-accent focus:ring-accent"
                            />
                            <span className="text-emerald-500 font-semibold flex items-center gap-1">
                              <CheckCircle2 className="h-3.5 w-3.5" /> Approve Captions
                            </span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer font-medium">
                            <input
                              type="radio"
                              name="captionReviewApproved"
                              checked={!captionReviewApproved}
                              onChange={() => setCaptionReviewApproved(false)}
                              className="text-accent focus:ring-accent"
                            />
                            <span className="text-rose-500 font-semibold flex items-center gap-1">
                              <AlertCircle className="h-3.5 w-3.5" /> Request Caption Revision
                            </span>
                          </label>
                        </div>
                        <div className="space-y-1">
                          <label className="font-medium text-foreground">Review Comments / Revision Notes</label>
                          <textarea
                            rows={2}
                            placeholder="Feedback or guidelines for the designer..."
                            value={captionReviewCommentsInput}
                            onChange={e => setCaptionReviewCommentsInput(e.target.value)}
                            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-accent"
                          />
                        </div>
                        <button
                          type="submit"
                          className="w-full py-2.5 rounded-xl bg-accent text-white font-semibold text-xs flex items-center justify-center gap-1.5 hover:bg-primary-light transition-all shadow-md shadow-accent/20 cursor-pointer"
                        >
                          <Sparkles className="h-3.5 w-3.5" />
                          Submit Caption Review Decision
                        </button>
                      </form>
                    ) : (
                      <p className="text-[11px] text-muted-foreground italic">
                        Draft captions submitted. Pending evaluation by {selectedDesign.assignedProofreaderName || 'the assigned proofreader'}.
                      </p>
                    )}
                  </div>
                )}

                {/* Stage 3: Two independent posting tasks — Instagram and LinkedIn each
                    get their own card and are marked done separately, since posting to
                    one platform doesn't mean the other is done. */}
                {(selectedDesign.workflowStage === 'posting_required' || selectedDesign.workflowStage === 'completed') && (
                  <div className="space-y-3">
                    <p className="font-semibold text-foreground flex items-center gap-1.5">
                      <Send className="h-3.5 w-3.5 text-accent" />
                      Stage 3: Social Media Posting Tasks (Designer Task — two separate tasks)
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className={`space-y-2.5 p-4 rounded-xl border ${
                        selectedDesign.postingInstagramDone
                          ? 'bg-emerald-500/10 border-emerald-500/20'
                          : 'bg-background/50 border-border'
                      }`}>
                        <span className="font-bold text-foreground flex items-center gap-1.5">
                          Instagram
                          {selectedDesign.postingInstagramDone && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
                        </span>
                        <p className="text-[11px] text-muted-foreground whitespace-pre-wrap">{selectedDesign.approvedInstagramCaption}</p>
                        {selectedDesign.postingInstagramDone ? (
                          <p className="text-[11px] font-semibold text-emerald-500">Posted &amp; marked complete</p>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleCompletePosting('instagram')}
                            className="w-full py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-[11px] flex items-center justify-center gap-1.5 transition-all shadow-md cursor-pointer"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Task Done: Mark Posted on Instagram
                          </button>
                        )}
                      </div>
                      <div className={`space-y-2.5 p-4 rounded-xl border ${
                        selectedDesign.postingLinkedinDone
                          ? 'bg-emerald-500/10 border-emerald-500/20'
                          : 'bg-background/50 border-border'
                      }`}>
                        <span className="font-bold text-foreground flex items-center gap-1.5">
                          LinkedIn
                          {selectedDesign.postingLinkedinDone && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
                        </span>
                        <p className="text-[11px] text-muted-foreground whitespace-pre-wrap">{selectedDesign.approvedLinkedinCaption || selectedDesign.approvedInstagramCaption}</p>
                        {selectedDesign.postingLinkedinDone ? (
                          <p className="text-[11px] font-semibold text-emerald-500">Posted &amp; marked complete</p>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleCompletePosting('linkedin')}
                            className="w-full py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-[11px] flex items-center justify-center gap-1.5 transition-all shadow-md cursor-pointer"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Task Done: Mark Posted on LinkedIn
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Stage Completed */}
                {selectedDesign.workflowStage === 'completed' && (
                  <div className="bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-xl space-y-2 text-xs">
                    <div className="flex items-center gap-2 text-emerald-500 font-bold">
                      <CheckCircle2 className="h-4 w-4" />
                      Social Media Workflow Completed
                    </div>
                    <p className="text-muted-foreground text-[11px]">
                      The design and approved captions have been successfully verified and posted on both Instagram and LinkedIn.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Description & Event */}
            {selectedDesign.description && (
              <div className="space-y-1 text-xs">
                <span className="font-semibold text-foreground">Designer Notes:</span>
                <p className="text-muted-foreground bg-muted/20 p-3 rounded-lg border border-border">
                  {selectedDesign.description}
                </p>
              </div>
            )}

            {/* Automated OCR + Spell-Check pass (run by the designer at upload time) */}
            {selectedDesign.ocrScan && (
              <div className="border-t border-border pt-4 space-y-2">
                <h3 className="text-sm font-bold flex items-center gap-2">
                  <Search className="h-4 w-4 text-accent" />
                  Automated Spelling Scan
                </h3>
                <OcrScanPanel
                  result={selectedDesign.ocrScan}
                  error=""
                  showExtractedText={showExtractedText}
                  onToggleExtractedText={() => setShowExtractedText(v => !v)}
                />
              </div>
            )}

            {/* Proofreading Action Form (for Assigned Proofreader / Admins) */}
            <div className="border-t border-border pt-4 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold flex items-center gap-2">
                  <UserCheck className="h-4 w-4 text-accent" />
                  Proofreading Desk Review
                </h3>
                {selectedDesign.assignedProofreaderName && (
                  <span className="text-xs text-muted-foreground">
                    Assigned: <span className="font-semibold text-foreground">{selectedDesign.assignedProofreaderName}</span>
                  </span>
                )}
              </div>

              {selectedDesign.review?.comments && (
                <div className="bg-muted/30 p-3 rounded-lg border border-border space-y-1 text-xs">
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span className="font-semibold text-foreground">Current Review Status:</span>
                    <span className="font-mono text-[10px]">{selectedDesign.review.reviewedAt?.split('T')[0]}</span>
                  </div>
                  <p className="text-foreground font-medium">{selectedDesign.review.status}</p>
                  <p className="text-muted-foreground italic">"{selectedDesign.review.comments}"</p>
                </div>
              )}

              {/* Reviewer Action Controls */}
              {(selectedDesign.assignedProofreaderEmail === user?.email || canViewAllDesigns(user)) ? (
                <form onSubmit={handleSaveReview} className="space-y-3 text-xs bg-muted/20 p-4 rounded-xl border border-border">
                  <p className="font-medium text-foreground">Update Proofreading Decision:</p>

                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 cursor-pointer font-medium">
                      <input
                        type="radio"
                        name="reviewStatus"
                        checked={reviewStatus === 'Proofread Approved'}
                        onChange={() => setReviewStatus('Proofread Approved')}
                        className="text-accent focus:ring-accent"
                      />
                      <span className="text-emerald-500 font-semibold flex items-center gap-1">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Approve Design
                      </span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer font-medium">
                      <input
                        type="radio"
                        name="reviewStatus"
                        checked={reviewStatus === 'Changes Requested'}
                        onChange={() => setReviewStatus('Changes Requested')}
                        className="text-accent focus:ring-accent"
                      />
                      <span className="text-rose-500 font-semibold flex items-center gap-1">
                        <AlertCircle className="h-3.5 w-3.5" /> Request Changes
                      </span>
                    </label>
                  </div>

                  <div className="space-y-1">
                    <label className="font-medium text-foreground">
                      Proofreader Comments & Feedback{reviewStatus === 'Changes Requested' ? ' *' : ' (optional)'}
                    </label>
                    <textarea
                      rows={3}
                      required={reviewStatus === 'Changes Requested'}
                      placeholder="Add specific corrections, text typos, color scheme notes..."
                      value={reviewComments}
                      onChange={e => setReviewComments(e.target.value)}
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-accent text-xs"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full py-2.5 rounded-xl bg-accent text-white font-bold hover:bg-primary-light text-xs flex items-center justify-center gap-1.5 shadow-md shadow-accent/20 cursor-pointer transition-all"
                  >
                    <Send className="h-3.5 w-3.5" />
                    Submit Proofreading Decision
                  </button>
                </form>
              ) : (
                <div className="p-3 bg-muted/20 rounded-lg text-xs text-muted-foreground flex items-center gap-2">
                  <Lock className="h-4 w-4 text-muted-foreground" />
                  Only the assigned proofreader ({selectedDesign.assignedProofreaderName || 'assigned member'}) or Tier 1–3 leadership can submit a proofread decision for this design.
                </div>
              )}
            </div>

            {/* Design Head Style Evaluation Section */}
            <div className="border-t border-border pt-4 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold flex items-center gap-2 text-foreground">
                  <Sparkles className="h-4 w-4 text-accent" />
                  Design Style & Aesthetics Approval (Design Head)
                </h3>
                {selectedDesign.styleStatus && (
                  <span className={`text-xs px-2.5 py-0.5 rounded-full font-bold ${
                    selectedDesign.styleStatus === 'Style Approved'
                      ? 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/20'
                      : selectedDesign.styleStatus === 'Style Rejected'
                      ? 'bg-rose-500/15 text-rose-500 border border-rose-500/20'
                      : 'bg-amber-500/15 text-amber-500 border border-amber-500/20'
                  }`}>
                    {selectedDesign.styleStatus}
                  </span>
                )}
              </div>

              {selectedDesign.styleFeedback && (
                <div className="bg-muted/30 p-3 rounded-lg border border-border space-y-1 text-xs">
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span className="font-semibold text-foreground">Design Head Style Notes:</span>
                    <span className="font-mono text-[10px]">{selectedDesign.styleDecidedAt?.split('T')[0]} ({selectedDesign.styleDecidedBy})</span>
                  </div>
                  <p className="text-muted-foreground italic">"{selectedDesign.styleFeedback}"</p>
                </div>
              )}

              {(isDesignHead(user) || isCentreHead(user) || hasCapability(user, 'DESIGN_STYLE_APPROVE')) ? (
                <form onSubmit={handleSaveStyleReview} className="space-y-3 text-xs bg-accent/5 p-4 rounded-xl border border-accent/20">
                  <p className="font-medium text-foreground">{selectedDesign.styleStatus ? 'Update Design Style Decision:' : 'Submit Design Style Decision:'}</p>

                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 cursor-pointer font-medium">
                      <input
                        type="radio"
                        name="styleStatus"
                        checked={styleStatus === 'Style Approved'}
                        onChange={() => setStyleStatus('Style Approved')}
                        className="text-accent focus:ring-accent"
                      />
                      <span className="text-emerald-500 font-semibold flex items-center gap-1">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Approve Style
                      </span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer font-medium">
                      <input
                        type="radio"
                        name="styleStatus"
                        checked={styleStatus === 'Style Rejected'}
                        onChange={() => setStyleStatus('Style Rejected')}
                        className="text-accent focus:ring-accent"
                      />
                      <span className="text-rose-500 font-semibold flex items-center gap-1">
                        <AlertCircle className="h-3.5 w-3.5" /> Reject Style
                      </span>
                    </label>
                  </div>

                  <div className="space-y-1">
                    <label className="font-medium text-foreground">
                      Style Feedback & Guidelines Compliance{styleStatus === 'Style Rejected' ? ' *' : ' (optional)'}
                    </label>
                    <textarea
                      rows={2}
                      required={styleStatus === 'Style Rejected'}
                      placeholder="Feedback on typography, color scheme, design alignment..."
                      value={styleFeedback}
                      onChange={e => setStyleFeedback(e.target.value)}
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-accent text-xs"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full py-2.5 rounded-xl bg-accent text-white font-bold hover:bg-primary-light text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-md shadow-accent/20 transition-all"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    Save Style Decision
                  </button>
                </form>
              ) : (
                <div className="p-3 bg-muted/20 rounded-lg text-xs text-muted-foreground flex items-center gap-2">
                  <Lock className="h-4 w-4 text-muted-foreground" />
                  Only a member with the designation of Design Head or Centre Head can approve or reject designs based on design style.
                </div>
              )}
            </div>

            {/* Sticky Bottom Close Inspector Bar */}
            <div className="sticky -bottom-6 -mx-6 -mb-6 p-4 bg-slate-900/95 dark:bg-[#0B1B2E]/95 bg-white/95 backdrop-blur-xl border-t border-border z-30 flex items-center justify-between rounded-b-2xl mt-6">
              <span className="text-xs text-muted-foreground font-medium">
                Design Inspection & Proofread Desk
              </span>
              <button
                type="button"
                onClick={() => {
                  setShowInspectorModal(false);
                  setSelectedDesign(null);
                }}
                className="px-5 py-2 rounded-xl bg-accent hover:bg-primary-light text-white font-semibold text-xs flex items-center gap-2 transition-all shadow-md shadow-accent/20 cursor-pointer"
              >
                <X className="h-4 w-4" />
                <span>Close Inspector</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
