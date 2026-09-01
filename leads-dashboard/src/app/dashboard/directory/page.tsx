'use client';

import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, 
  Download, 
  Upload, 
  X, 
  ShieldAlert, 
  CheckCircle, 
  Search, 
  UserMinus, 
  Edit2, 
  ChevronLeft, 
  ChevronRight,
  ArrowUpDown,
  Users,
  Award,
  GraduationCap,
  ShieldCheck,
  UserCheck,
  Eye,
  CheckSquare,
  Square,
  MinusSquare,
  Layers,
  BookOpen,
  UserX,
  ShieldOff,
  Mail,
  KeyRound,
  Lock,
  EyeOff,
  Copy,
  Key,
  CheckCircle2
} from 'lucide-react';
import { useDropTarget } from '@/components/ui/file-dropzone';
import { parseCsvLine, splitCsvLines, toCsvRow, downloadCsv } from '@/lib/csv';
import {
  getMembers,
  addMember,
  updateMember,
  deleteMember,
  bulkUpdateMembers,
  bulkDeleteMembers,
  logAuditEvent,
  terminateMember,
  reactivateMember,
  requestMemberPasswordReset,
  adminSetMemberPassword,
  Member,
  MemberDivision
} from '@/lib/local-data';
import { ConfirmModal } from '@/components/ui/confirm-modal';
import { StudentProfileModal } from '@/components/student-profile-modal';
import { canViewFullDirectory, canEditDirectory, canEditMemberRecordRow, isRestrictedDirectoryEditor, isCentreHead, canViewHiddenAccounts, canSetMemberPassword, isKayomarzPavri } from '@/lib/permissions';

export default function DirectoryPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [user, setUser] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDivision, setSelectedDivision] = useState<string>('ALL');
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deletingMember, setDeletingMember] = useState<Member | null>(null);
  const [terminatingMember, setTerminatingMember] = useState<Member | null>(null);
  const [terminationReason, setTerminationReason] = useState('');
  const [terminationError, setTerminationError] = useState('');
  const [reactivatingMember, setReactivatingMember] = useState<Member | null>(null);
  const [passwordResetModalMember, setPasswordResetModalMember] = useState<Member | null>(null);
  const [isTogglingPasswordReset, setIsTogglingPasswordReset] = useState(false);
  const [setPasswordModalMember, setSetPasswordModalMember] = useState<Member | null>(null);
  const [newPasswordValue, setNewPasswordValue] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [isSettingPassword, setIsSettingPassword] = useState(false);
  const [setPasswordError, setSetPasswordError] = useState('');
  const [selectedStudentForProfile, setSelectedStudentForProfile] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { isDragOver: isCsvDragOver, dragHandlers: csvDragHandlers } = useDropTarget((files) => handleCsvFile(files[0]));

  // Pagination & Sorting State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [sortField, setSortField] = useState<keyof Member>('tier');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const STANDARDIZED_DEPARTMENTS = [
    'Leadership & Development',
    'Research & Development',
    'Design & Social Media',
    'Sustainability & Innovation',
    'Finance & Sponsorships',
    'Marketing & Branding',
    'Operations & Logistics',
  ];

  type FacultyPosition = 'Events Head' | 'Industrial Connects' | 'Finance Head' | 'Centre Head' | 'Advisor';
  type CorePosition = 'President' | 'Vice President' | 'General Secretary' | 'Chief Coordinator' | 'Department Head';
  type AssociatePosition = 'Associate' | 'Department Associate';

  const deriveMemberRoleAndDepartment = (
    div: MemberDivision,
    opts: {
      facultyPosition?: string;
      campus?: 'GG Campus' | 'RTC Campus';
      corePosition?: string;
      departmentSelect?: string;
      associatePosition?: string;
      customRole?: string;
    }
  ): { role: string; department: string; tier: number } => {
    let role = '';
    let department = opts.departmentSelect || '';
    let tier = 6;

    if (div === 'Faculty') {
      const pos = opts.facultyPosition || 'Events Head';
      if (pos === 'Events Head') {
        const camp = opts.campus === 'RTC Campus' ? 'RTC Campus' : 'GG Campus';
        role = `Head of Events (${camp})`;
        department = 'Events';
        tier = camp === 'GG Campus' ? 2.5 : 3;
      } else if (pos === 'Industrial Connects') {
        role = 'Head of Industrial Connects';
        department = 'Industrial Connects';
        tier = 3;
      } else if (pos === 'Finance Head') {
        role = 'Head of Finance';
        department = 'Finance & Sponsorships';
        tier = 3;
      } else if (pos === 'Centre Head') {
        role = 'Centre Head';
        department = 'Faculty Oversight';
        tier = 1;
      } else if (pos === 'Advisor') {
        role = 'Advisor';
        department = 'Faculty Advisory';
        tier = 1;
      } else {
        role = 'Faculty Member';
        department = opts.departmentSelect || 'Faculty';
        tier = 4;
      }
    } else if (div === 'Core Committee') {
      tier = 5;
      const pos = opts.corePosition || 'Department Head';
      if (pos === 'President') {
        role = 'President';
        department = 'Executive Council';
      } else if (pos === 'Vice President') {
        role = 'Vice President';
        department = 'Executive Council';
      } else if (pos === 'General Secretary') {
        role = 'General Secretary';
        department = 'Secretariat';
      } else if (pos === 'Chief Coordinator') {
        role = 'Chief Coordinator';
        department = 'Coordination';
      } else if (pos === 'Department Head') {
        const dept = opts.departmentSelect || STANDARDIZED_DEPARTMENTS[0];
        role = `Head of ${dept}`;
        department = dept;
      } else {
        role = pos || 'Core Committee Member';
      }
    } else if (div === 'Advisory Board') {
      tier = 4;
      const pos = opts.corePosition || 'Department Head';
      if (pos === 'President') {
        role = 'Senior President';
        department = 'Executive Council';
      } else if (pos === 'Vice President') {
        role = 'Senior Vice President';
        department = 'Executive Council';
      } else if (pos === 'General Secretary') {
        role = 'Senior General Secretary';
        department = 'Secretariat';
      } else if (pos === 'Chief Coordinator') {
        role = 'Senior Chief Coordinator';
        department = 'Coordination';
      } else if (pos === 'Department Head') {
        const dept = opts.departmentSelect || STANDARDIZED_DEPARTMENTS[0];
        role = `Senior Head of ${dept}`;
        department = dept;
      } else {
        role = pos.startsWith('Senior') ? pos : `Senior ${pos || 'Advisory Member'}`;
      }
    } else if (div === 'Training Associate') {
      tier = 6;
      const dept = opts.departmentSelect || STANDARDIZED_DEPARTMENTS[0];
      role = `Associate - ${dept}`;
      department = dept;
    } else if (div === 'Alumni') {
      tier = 7;
      role = 'Alumni Member';
      department = opts.departmentSelect || 'Alumni Roster';
    }

    if (opts.customRole && opts.customRole.trim()) {
      const cr = opts.customRole.trim();
      if (cr.includes('Head') || cr.includes('President') || cr.includes('Secretary') || cr.includes('Advisor')) {
        role = cr;
      }
    }

    return { role, department, tier };
  };

  // Manual Add Form State
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [division, setDivision] = useState<MemberDivision>('Faculty');
  const [facultyPosition, setFacultyPosition] = useState<FacultyPosition>('Events Head');
  const [campus, setCampus] = useState<'GG Campus' | 'RTC Campus'>('GG Campus');
  const [corePosition, setCorePosition] = useState<CorePosition>('Department Head');
  const [departmentSelect, setDepartmentSelect] = useState<string>(STANDARDIZED_DEPARTMENTS[0]);
  const [associatePosition, setAssociatePosition] = useState<AssociatePosition>('Associate');
  const [program, setProgram] = useState('');
  const [batch, setBatch] = useState('');
  
  // Notification Alert State
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [resendingMemberId, setResendingMemberId] = useState<string | null>(null);

  // Bulk Selection & Uniform Actions State
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [isBulkEditModalOpen, setIsBulkEditModalOpen] = useState(false);
  const [isBulkDeleteModalOpen, setIsBulkDeleteModalOpen] = useState(false);
  
  // Bulk Edit Form State
  const [bulkDivision, setBulkDivision] = useState<MemberDivision | ''>('');
  const [bulkRole, setBulkRole] = useState('');
  const [bulkBatch, setBulkBatch] = useState('');
  const [applyDivision, setApplyDivision] = useState(true);
  const [applyRole, setApplyRole] = useState(false);
  const [applyBatch, setApplyBatch] = useState(false);

  // Edit Member Form State
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editDivision, setEditDivision] = useState<MemberDivision>('Faculty');
  const [editFacultyPosition, setEditFacultyPosition] = useState<FacultyPosition>('Events Head');
  const [editCampus, setEditCampus] = useState<'GG Campus' | 'RTC Campus'>('GG Campus');
  const [editCorePosition, setEditCorePosition] = useState<CorePosition>('Department Head');
  const [editDepartmentSelect, setEditDepartmentSelect] = useState<string>(STANDARDIZED_DEPARTMENTS[0]);
  const [editAssociatePosition, setEditAssociatePosition] = useState<AssociatePosition>('Associate');
  const [editProgram, setEditProgram] = useState('');
  const [editBatch, setEditBatch] = useState('');
  const [editTierOverride, setEditTierOverride] = useState<number>(4);

  useEffect(() => {
    const refreshData = () => {
      setMembers(getMembers());
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

  // Rows skipped during the last CSV import specifically because their email
  // already exists elsewhere (in the roster or earlier in the same file) —
  // kept around (not auto-dismissed like the toasts above) so the user can
  // download them, fix the email, and re-upload rather than losing track of
  // which rows didn't make it in.
  const [emailConflicts, setEmailConflicts] = useState<{ name: string; email: string; division: string; role: string; department: string; program: string; batch: string }[]>([]);

  const triggerSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setErrorMsg('');
    setTimeout(() => setSuccessMsg(''), 4000);
  };

  const triggerError = (msg: string) => {
    setErrorMsg(msg);
    setSuccessMsg('');
    setTimeout(() => setErrorMsg(''), 4000);
  };

  // Activation & One-Time Password Setup Modal state
  const [activationModalData, setActivationModalData] = useState<{ member: Member; link?: string } | null>(null);
  const [copiedActivationLink, setCopiedActivationLink] = useState(false);
  const [adminPasswordInput, setAdminPasswordInput] = useState('');
  const [isAdminSettingPassword, setIsAdminSettingPassword] = useState(false);
  const [adminPasswordSuccessMsg, setAdminPasswordSuccessMsg] = useState('');

  const handleOpenActivationModal = async (member: Member, initialLink?: string) => {
    setCopiedActivationLink(false);
    setAdminPasswordInput('');
    setAdminPasswordSuccessMsg('');
    setActivationModalData({ member, link: initialLink });

    if (!initialLink) {
      try {
        const res = await fetch(`/api/members/${member.id}/resend-activation`, { method: 'POST' });
        const data = await res.json();
        if (data.activationLink) {
          setActivationModalData({ member, link: data.activationLink });
        }
      } catch (e) {
        console.error('Failed to fetch activation link:', e);
      }
    }
  };

  const handleAdminSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activationModalData || !adminPasswordInput.trim() || adminPasswordInput.length < 4) return;
    setIsAdminSettingPassword(true);
    setAdminPasswordSuccessMsg('');
    try {
      const res = await fetch(`/api/members/${activationModalData.member.id}/set-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword: adminPasswordInput.trim(), actorName: user?.name || 'Admin' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to set password');

      setAdminPasswordSuccessMsg(`Password set successfully! ${activationModalData.member.name} can now log in immediately.`);
      setAdminPasswordInput('');
      setMembers(getMembers());
    } catch (err: any) {
      triggerError(err.message || 'Failed to set password');
    } finally {
      setIsAdminSettingPassword(false);
    }
  };

  const handleResendActivation = async (member: Member) => {
    setResendingMemberId(member.id);
    try {
      const res = await fetch(`/api/members/${member.id}/resend-activation`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to resend the welcome email.');
      triggerSuccess(data.message || `Welcome email resent to ${member.email}.`);
      if (data.activationLink && activationModalData?.member.id === member.id) {
        setActivationModalData({ member, link: data.activationLink });
      }
    } catch (err: any) {
      triggerError(err.message || 'Failed to resend the welcome email.');
    } finally {
      setResendingMemberId(null);
    }
  };

  const TIER_LABELS = [
    { tier: 1, label: 'Super User / Centre Head / Advisor' },
    { tier: 2, label: 'Executive Leadership' },
    { tier: 2.5, label: 'GG Campus Events Head' },
    { tier: 3, label: 'RTC Events Head / Finance Head / Industrial Connects' },
    { tier: 4, label: 'Advisory Board / Faculty' },
    { tier: 5, label: 'Core Committee' },
    { tier: 6, label: 'Training Associate' },
    { tier: 7, label: 'Alumni' },
  ];

  const handleCreateMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;

    try {
      const derived = deriveMemberRoleAndDepartment(division, {
        facultyPosition,
        campus,
        corePosition,
        departmentSelect,
        associatePosition,
      });

      const created = await addMember({
        name: name.trim(),
        email: email.toLowerCase().trim(),
        role: derived.role,
        tier: derived.tier,
        division,
        department: derived.department,
        program: program.trim() || undefined,
        batch: division === 'Alumni' ? batch.trim() : undefined,
        // Powers the restricted "uploader" edit rule for non-admin editors —
        // see permissions.ts's canEditMemberRecordRow.
        createdBy: user?.email,
        createdAt: new Date().toISOString(),
      });

      setName('');
      setEmail('');
      setDivision('Faculty');
      setFacultyPosition('Events Head');
      setCampus('GG Campus');
      setCorePosition('Department Head');
      setDepartmentSelect(STANDARDIZED_DEPARTMENTS[0]);
      setAssociatePosition('Associate');
      setProgram('');
      setBatch('');
      setIsModalOpen(false);

      setMembers(getMembers());
      triggerSuccess('New member added to roster successfully.');

      handleOpenActivationModal(created, created.activationLink);
    } catch (err: any) {
      triggerError(err.message || 'Failed to add member.');
    }
  };

  const startEdit = (member: Member) => {
    setEditingMember(member);
    setEditName(member.name);
    setEditEmail(member.email);
    const div = member.division || 'Faculty';
    setEditDivision(div);
    setEditProgram(member.program || '');
    setEditBatch(member.batch || '');
    setEditTierOverride(member.tier || 4);

    const r = member.role || '';
    const d = member.department || '';

    // Infer faculty position
    if (r.includes('Events') || r.includes('Event')) {
      setEditFacultyPosition('Events Head');
      setEditCampus(r.includes('RTC') ? 'RTC Campus' : 'GG Campus');
    } else if (r.includes('Industrial Connects')) {
      setEditFacultyPosition('Industrial Connects');
    } else if (r.includes('Finance')) {
      setEditFacultyPosition('Finance Head');
    } else if (r.includes('Centre Head') || r.includes('Center Head')) {
      setEditFacultyPosition('Centre Head');
    } else if (r.includes('Advisor')) {
      setEditFacultyPosition('Advisor');
    } else {
      setEditFacultyPosition('Events Head');
      setEditCampus('GG Campus');
    }

    // Infer core / advisory position
    if (r.includes('President') && !r.includes('Vice')) {
      setEditCorePosition('President');
    } else if (r.includes('Vice President')) {
      setEditCorePosition('Vice President');
    } else if (r.includes('General Secretary')) {
      setEditCorePosition('General Secretary');
    } else if (r.includes('Chief Coordinator')) {
      setEditCorePosition('Chief Coordinator');
    } else {
      setEditCorePosition('Department Head');
    }

    // Infer department
    if (STANDARDIZED_DEPARTMENTS.includes(d)) {
      setEditDepartmentSelect(d);
    } else {
      const match = STANDARDIZED_DEPARTMENTS.find(dept => r.includes(dept) || d.includes(dept));
      setEditDepartmentSelect(match || STANDARDIZED_DEPARTMENTS[0]);
    }

    if (r.includes('Associate - ')) {
      setEditAssociatePosition('Department Associate');
    } else {
      setEditAssociatePosition('Associate');
    }
  };

  const handleUpdateMember = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMember || !editName.trim() || !editEmail.trim()) return;

    const currentMembers = getMembers();
    const emailConflict = currentMembers.some(
      m => m.id !== editingMember.id && m.email.toLowerCase() === editEmail.toLowerCase().trim()
    );
    if (emailConflict) {
      triggerError(`Email ${editEmail} is already assigned to another member.`);
      return;
    }

    const isSuperUser = user?.tier === 1;
    const derived = deriveMemberRoleAndDepartment(editDivision, {
      facultyPosition: editFacultyPosition,
      campus: editCampus,
      corePosition: editCorePosition,
      departmentSelect: editDepartmentSelect,
      associatePosition: editAssociatePosition,
    });

    const finalTier = isSuperUser ? editTierOverride : derived.tier;
    const tierChanged = isSuperUser && finalTier !== editingMember.tier;

    updateMember(editingMember.id, {
      name: editName.trim(),
      email: editEmail.toLowerCase().trim(),
      role: derived.role,
      tier: finalTier,
      division: editDivision,
      department: derived.department,
      program: editProgram.trim() || undefined,
      batch: editDivision === 'Alumni' ? editBatch.trim() : undefined,
      // A restricted (non-admin) editor spends their one-time edit the moment
      // they save — a full admin can keep editing the same record anytime.
      ...(isRestrictedDirectoryEditor(user) ? { selfEditUsedAt: new Date().toISOString() } : {}),
    }, user?.name || 'Admin');

    if (tierChanged) {
      logAuditEvent(
        'MEMBER_ACCESS_LEVEL_CHANGED',
        user?.name || 'Admin',
        `Changed ${editName.trim()}'s access tier from ${editingMember.tier} to ${finalTier}`,
        user?.email
      );
    }

    setEditingMember(null);
    setMembers(getMembers());
    triggerSuccess('Member details and division updated.');
  };

  const handleDownloadTemplate = () => {
    const csvContent = 'Name,Email,Division,Role,Department,Program,Batch\n' +
      'John Doe,john.doe@msruas.ac.in,Training Associate,Junior Coordinator,Operations and Logistics,B.Tech Computer Science Engineering,\n' +
      'Jane Smith,jane.smith@msruas.ac.in,Core Committee,Vice President,Executive Council,B.Tech Electronics and Communication,\n' +
      'Dr. Sharath Kumar,sharath.kumar@msruas.ac.in,Advisory Board,Advisory Member,Faculty Advisory,,\n' +
      'Dr. Ajay Rao,ajay.rao@msruas.ac.in,Faculty,Assistant Professor,Faculty Advisory,,\n' +
      'Kayomarz M Pavri,kayo2970@gmail.com,Alumni,Alumni Mentor,Design and Social Media,,Class of 2024';
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'leads_organization_roster_template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    handleCsvFile(file);
    e.target.value = '';
  };

  const handleCsvFile = (file: File | undefined) => {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      if (!text) return;

      try {
        const lines = splitCsvLines(text);
        if (lines.length < 2) {
          triggerError('CSV file is empty or missing headers.');
          return;
        }

        const headers = parseCsvLine(lines[0]).map(h => h.toLowerCase());
        const nameIndex = headers.indexOf('name');
        const emailIndex = headers.indexOf('email');
        const divisionIndex = headers.indexOf('division');
        const roleIndex = headers.indexOf('role');
        const deptIndex = headers.indexOf('department');
        const programIndex = headers.indexOf('program');
        const batchIndex = headers.indexOf('batch');

        if (nameIndex === -1 || emailIndex === -1) {
          triggerError('Invalid CSV headers. Required at minimum: Name, Email');
          return;
        }

        // Track emails seen so far (existing roster + rows already imported this
        // pass) so both cross-roster AND within-file duplicates are caught, while
        // each new row still goes through addMember() so it actually reaches the
        // server — a manual push + single saveMembers() call at the end (the old
        // approach) only ever wrote localStorage, never the server.
        const seenEmails = new Set(getMembers().map(m => m.email.toLowerCase()));
        let importCount = 0;
        let duplicateCount = 0;
        const conflicts: typeof emailConflicts = [];

        for (let i = 1; i < lines.length; i++) {
          const values = parseCsvLine(lines[i]);
          if (values.length < 2) continue;

          const mName = values[nameIndex];
          const mEmail = values[emailIndex]?.toLowerCase();
          const mDivStr = divisionIndex !== -1 ? values[divisionIndex] : '';
          const mRole = roleIndex !== -1 ? values[roleIndex] : '';
          const mDept = deptIndex !== -1 ? values[deptIndex] : '';
          const mProgram = programIndex !== -1 ? values[programIndex] : '';
          const mBatch = batchIndex !== -1 ? values[batchIndex] : '';

          if (!mName || !mEmail) continue;

          if (seenEmails.has(mEmail)) {
            duplicateCount++;
            conflicts.push({ name: mName, email: mEmail, division: mDivStr, role: mRole, department: mDept, program: mProgram, batch: mBatch });
            continue;
          }

          let mDivision: MemberDivision = 'Training Associate';
          const divLower = mDivStr.toLowerCase();
          const roleLower = mRole.toLowerCase();

          if (divLower.includes('faculty') || roleLower.includes('professor') || roleLower.includes('faculty')) {
            mDivision = 'Faculty';
          } else if (divLower.includes('advisor') || divLower.includes('board')) {
            mDivision = 'Advisory Board';
          } else if (
            divLower.includes('core') ||
            roleLower.startsWith('head') ||
            roleLower.includes('president') ||
            roleLower.includes('secretary') ||
            roleLower.includes('chief coordinator')
          ) {
            mDivision = 'Core Committee';
          } else if (divLower.includes('alumni')) {
            mDivision = 'Alumni';
          } else {
            mDivision = 'Training Associate';
          }

          const mTier = deriveMemberRoleAndDepartment(mDivision, { customRole: mRole, departmentSelect: mDept }).tier;

          // Awaited — addMember is async (it reaches the server before
          // resolving), so an unawaited call here would let a real failure
          // slip past this try/catch as an unhandled rejection instead of
          // being counted as skipped.
          try {
            await addMember({
              name: mName,
              email: mEmail,
              role: mRole || mDivision,
              tier: mTier,
              division: mDivision,
              department: mDept || undefined,
              program: mProgram || undefined,
              batch: mDivision === 'Alumni' ? mBatch : undefined
            });
            seenEmails.add(mEmail);
            importCount++;
          } catch {
            duplicateCount++;
            conflicts.push({ name: mName, email: mEmail, division: mDivStr, role: mRole, department: mDept, program: mProgram, batch: mBatch });
          }
        }

        setEmailConflicts(conflicts);

        if (importCount > 0) {
          setMembers(getMembers());
          triggerSuccess(`Successfully imported ${importCount} new members. ${duplicateCount > 0 ? `(${duplicateCount} email conflicts skipped — see below)` : ''}`);
        } else if (duplicateCount > 0) {
          triggerError(`No new members imported. ${duplicateCount} email conflicts found in file — see below.`);
        } else {
          triggerError('No valid member rows found in the CSV.');
        }
      } catch {
        triggerError('Error parsing CSV file. Please verify formatting.');
      }
    };
    reader.readAsText(file);
  };

  const handleDownloadEmailConflicts = () => {
    const header = toCsvRow(['Name', 'Email', 'Division', 'Role', 'Department', 'Program', 'Batch', 'Conflict Reason']);
    const rows = emailConflicts.map(c => toCsvRow([c.name, c.email, c.division, c.role, c.department, c.program, c.batch, 'Email already exists in the roster']));
    downloadCsv(`leads_members_email_conflicts_${new Date().toISOString().slice(0, 10)}.csv`, [header, ...rows].join('\n'));
  };

  const handleDownloadFullBackup = () => {
    const header = toCsvRow(['Name', 'Email', 'Division', 'Role', 'Department', 'Program', 'Batch', 'Status', 'Tier']);
    const rows = members.map(m => toCsvRow([m.name, m.email, m.division, m.role, m.department, m.program, m.batch, m.status || 'Active', m.tier]));
    downloadCsv(`leads_members_backup_${new Date().toISOString().slice(0, 10)}.csv`, [header, ...rows].join('\n'));
    triggerSuccess(`Downloaded a backup of all ${members.length} members.`);
  };

  const handleConfirmDelete = () => {
    if (!deletingMember) return;
    // Kayomarz Pavri alone can delete another Super User account — never his
    // own, which the row-level gate below already keeps out of reach here.
    const bypassSuperUserProtection = isKayomarzPavri(user) && deletingMember.id !== user?.id;
    try {
      deleteMember(deletingMember.id, user?.name || 'Super User', bypassSuperUserProtection);
      setMembers(getMembers());
      triggerSuccess(`Removed ${deletingMember.name} from directory.`);
    } catch (err: any) {
      triggerError(err.message || 'Failed to remove member.');
    } finally {
      setDeletingMember(null);
    }
  };

  const handleConfirmTerminate = async () => {
    if (!terminatingMember) return;
    if (!terminationReason.trim()) {
      setTerminationError('Please provide a reason for the termination — it will be included in the official notification email.');
      return;
    }
    const target = terminatingMember;
    const reason = terminationReason.trim();
    try {
      terminateMember(target.id, user?.name || 'Centre Head');
      setMembers(getMembers());

      try {
        await fetch('/api/email/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            scope: 'SINGLE',
            recipientEmail: target.email,
            subject: 'Notice: Termination from LEADS Next Gen Centre',
            bodyText: `Dear ${target.name},\n\nThis is to inform you that you have been terminated from LEADS Next Gen Centre by ${user?.name || 'the Centre Head'}.\n\nReason for termination: ${reason}\n\nConsider this an official notification of your termination.\n\nRegards,\nLEADS Administration`,
            category: 'SYSTEM_NOTIFICATION',
          }),
        });
      } catch {
        // Silently ignore mail dispatch error to avoid blocking termination flow
      }

      triggerSuccess(`${target.name} has been terminated and notified via registered email.`);
    } catch (err: any) {
      triggerError(err.message || 'Failed to terminate member.');
    } finally {
      setTerminatingMember(null);
      setTerminationReason('');
      setTerminationError('');
    }
  };

  const handleConfirmReactivate = () => {
    if (!reactivatingMember) return;
    try {
      reactivateMember(reactivatingMember.id, user?.name || 'Centre Head');
      setMembers(getMembers());
      triggerSuccess(`${reactivatingMember.name}'s dashboard access has been restored.`);
    } catch (err: any) {
      triggerError(err.message || 'Failed to reactivate member.');
    } finally {
      setReactivatingMember(null);
    }
  };

  const handleConfirmPasswordResetToggle = async () => {
    if (!passwordResetModalMember) return;
    setIsTogglingPasswordReset(true);
    const nextState = !passwordResetModalMember.mustSetupPassword;
    const res = await requestMemberPasswordReset(passwordResetModalMember.id, nextState);
    setIsTogglingPasswordReset(false);
    if (res.success) {
      triggerSuccess(res.message || `Password setup request updated for ${passwordResetModalMember.name}.`);
      setMembers(getMembers());
    } else {
      triggerError(res.error || 'Failed to update password setup request.');
    }
    setPasswordResetModalMember(null);
  };

  const handleConfirmSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!setPasswordModalMember) return;
    if (newPasswordValue.length < 4) {
      setSetPasswordError('Password must be at least 4 characters long.');
      return;
    }
    setIsSettingPassword(true);
    setSetPasswordError('');
    const res = await adminSetMemberPassword(setPasswordModalMember.id, newPasswordValue, user?.name || 'Super User');
    setIsSettingPassword(false);
    if (res.success) {
      triggerSuccess(res.message || `Password updated for ${setPasswordModalMember.name}.`);
      setMembers(getMembers());
      setSetPasswordModalMember(null);
      setNewPasswordValue('');
    } else {
      setSetPasswordError(res.error || 'Failed to set password.');
    }
  };

  const toggleSort = (field: keyof Member) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const isAdmin = canEditDirectory(user);
  const canViewRoster = canViewFullDirectory(user);

  const isCurrentSuperUser = canViewHiddenAccounts(user);

  // Security & Privacy: Super User profiles are hidden from the directory for everyone
  // except other Super Users and Kayomarz Pavri (see canViewHiddenAccounts) — this
  // stays true even as more hidden Super User accounts get added, since he sees every
  // hidden account by identity, not just the ones his own current tier would unlock.
  const visibleMembers = members.filter(m => {
    if (isCurrentSuperUser) return true;
    return m.id !== 'm1' && m.tier !== 1 && m.role !== 'Super User' && m.email?.toLowerCase() !== 'kayo2970@gmail.com';
  });

  // Filter members list based on division tab and search query
  const filteredMembers = visibleMembers
    .filter(m => {
      if (selectedDivision === 'TERMINATED') {
        if (m.status !== 'Terminated') return false;
      } else if (selectedDivision !== 'ALL' && m.division !== selectedDivision) {
        return false;
      }
      const q = searchQuery.toLowerCase();
      const nameMatch = (m.name || '').toLowerCase().includes(q);
      const emailMatch = (m.email || '').toLowerCase().includes(q);
      const roleMatch = (m.role || '').toLowerCase().includes(q);
      const divMatch = (m.division || '').toLowerCase().includes(q);
      return nameMatch || emailMatch || roleMatch || divMatch;
    })
    .sort((a, b) => {
      let aVal = a[sortField] ?? '';
      let bVal = b[sortField] ?? '';
      if (typeof aVal === 'string') aVal = aVal.toLowerCase();
      if (typeof bVal === 'string') bVal = bVal.toLowerCase();
      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

  // Division counts
  const advisoryCount = visibleMembers.filter(m => m.division === 'Advisory Board').length;
  const coreCount = visibleMembers.filter(m => m.division === 'Core Committee').length;
  const trainingCount = visibleMembers.filter(m => m.division === 'Training Associate').length;
  const alumniCount = visibleMembers.filter(m => m.division === 'Alumni').length;
  const facultyCount = visibleMembers.filter(m => m.division === 'Faculty').length;
  const terminatedCount = visibleMembers.filter(m => m.status === 'Terminated').length;

  const totalPages = Math.ceil(filteredMembers.length / pageSize) || 1;
  const paginatedMembers = filteredMembers.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // Checkbox selection helpers
  const paginatedIds = paginatedMembers.map(m => m.id);
  const allPaginatedSelected = paginatedMembers.length > 0 && paginatedMembers.every(m => selectedMemberIds.includes(m.id));
  const somePaginatedSelected = paginatedMembers.some(m => selectedMemberIds.includes(m.id)) && !allPaginatedSelected;

  const toggleSelectAllPage = () => {
    if (allPaginatedSelected) {
      const pageIdSet = new Set(paginatedIds);
      setSelectedMemberIds(prev => prev.filter(id => !pageIdSet.has(id)));
    } else {
      setSelectedMemberIds(prev => Array.from(new Set([...prev, ...paginatedIds])));
    }
  };

  const toggleSelectMember = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedMemberIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleSelectAllFiltered = () => {
    setSelectedMemberIds(filteredMembers.map(m => m.id));
  };

  const handleClearSelection = () => {
    setSelectedMemberIds([]);
  };

  // Bulk Operations Handlers
  const handleBulkMoveDivision = (targetDivision: MemberDivision) => {
    if (selectedMemberIds.length === 0) return;
    try {
      const calculatedTier = deriveMemberRoleAndDepartment(targetDivision, {}).tier;
      bulkUpdateMembers(
        selectedMemberIds,
        {
          division: targetDivision,
          tier: calculatedTier,
          batch: targetDivision === 'Alumni' ? 'Class of 2025' : undefined
        },
        user?.name || 'Admin'
      );
      setMembers(getMembers());
      triggerSuccess(`Successfully moved ${selectedMemberIds.length} members to ${targetDivision}.`);
      setSelectedMemberIds([]);
    } catch (err: any) {
      triggerError(err.message || 'Failed to update division for selected members.');
    }
  };

  const handleApplyBulkEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedMemberIds.length === 0) return;

    if (!applyDivision && !applyRole && !applyBatch) {
      triggerError('Please select at least one field to update.');
      return;
    }

    try {
      const updates: Partial<Pick<Member, 'division' | 'role' | 'batch' | 'tier'>> = {};
      if (applyDivision && bulkDivision) {
        updates.division = bulkDivision as MemberDivision;
        updates.tier = deriveMemberRoleAndDepartment(bulkDivision as MemberDivision, {}).tier;
      }
      if (applyRole && bulkRole.trim()) {
        updates.role = bulkRole.trim();
      }
      if (applyBatch) {
        updates.batch = bulkBatch.trim() || undefined;
      }

      bulkUpdateMembers(selectedMemberIds, updates, user?.name || 'Admin');
      setMembers(getMembers());
      triggerSuccess(`Applied uniform updates to ${selectedMemberIds.length} members.`);
      setIsBulkEditModalOpen(false);
      setSelectedMemberIds([]);
      // Reset form
      setBulkDivision('');
      setBulkRole('');
      setBulkBatch('');
      setApplyDivision(true);
      setApplyRole(false);
      setApplyBatch(false);
    } catch (err: any) {
      triggerError(err.message || 'Failed to apply uniform changes.');
    }
  };

  const handleBulkExportCSV = () => {
    if (selectedMemberIds.length === 0) return;
    const selectedList = members.filter(m => selectedMemberIds.includes(m.id));
    const header = 'Name,Email,Division,Role,Batch';
    const rows = selectedList.map(m => 
      `"${(m.name || '').replace(/"/g, '""')}","${(m.email || '').replace(/"/g, '""')}","${(m.division || '').replace(/"/g, '""')}","${(m.role || '').replace(/"/g, '""')}","${(m.batch || '').replace(/"/g, '""')}"`
    );
    const csvContent = [header, ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `leads_members_export_${selectedMemberIds.length}_selected.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    triggerSuccess(`Exported ${selectedMemberIds.length} members to CSV.`);
  };

  const handleConfirmBulkDelete = () => {
    if (selectedMemberIds.length === 0) return;
    try {
      bulkDeleteMembers(selectedMemberIds, user?.name || 'Admin');
      setMembers(getMembers());
      triggerSuccess(`Removed ${selectedMemberIds.length} members from directory.`);
      setSelectedMemberIds([]);
      setIsBulkDeleteModalOpen(false);
    } catch (err: any) {
      triggerError(err.message || 'Failed to remove selected members.');
    }
  };

  if (user && !canViewRoster) {
    return (
      <div className="p-6 md:p-8 space-y-6">
        <div>
          <h1 className="text-xl font-bold text-theme-text-primary">My Profile</h1>
          <p className="text-xs text-theme-text-secondary">The full organization directory is limited to Core Committee, Advisory Board, and Head designations.</p>
        </div>
        <StudentProfileModal
          memberIdOrName={user.id || user.name}
          onClose={() => {}}
        />
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 space-y-6">

      {/* Notifications */}
      {successMsg && (
        <div className="flex items-center gap-3 p-4 bg-success/15 border border-success/20 rounded-2xl text-theme-text-primary text-xs animate-in fade-in duration-300">
          <CheckCircle className="h-5 w-5 text-success shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}
      {errorMsg && (
        <div className="flex items-center gap-3 p-4 bg-danger/15 border border-danger/20 rounded-2xl text-theme-text-primary text-xs animate-in fade-in duration-300">
          <ShieldAlert className="h-5 w-5 text-danger shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {emailConflicts.length > 0 && (
        <div className="flex items-start sm:items-center justify-between gap-3 p-4 bg-warning/15 border border-warning/30 rounded-2xl text-xs animate-in fade-in duration-300 flex-col sm:flex-row">
          <div className="flex items-start sm:items-center gap-3">
            <Mail className="h-5 w-5 text-warning shrink-0" />
            <span className="text-theme-text-primary">
              {emailConflicts.length} row{emailConflicts.length === 1 ? '' : 's'} skipped during the last import — the email address already exists in the roster.
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleDownloadEmailConflicts}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-warning/20 hover:bg-warning/30 text-warning text-xs font-semibold rounded-xl transition-all cursor-pointer border border-warning/40"
            >
              <Download className="h-3.5 w-3.5" />
              Download Conflict Report
            </button>
            <button
              onClick={() => setEmailConflicts([])}
              className="p-1.5 text-theme-text-secondary hover:text-theme-text-primary hover:bg-theme-border/20 rounded-lg transition-all cursor-pointer"
              title="Dismiss"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Header section with actions */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-theme-text-primary">Organization Members Directory</h1>
          <p className="text-xs text-theme-text-secondary">Explore center divisions: Advisory Board, Core Committee, Training Associates, and Alumni</p>
        </div>

        {isAdmin && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleDownloadFullBackup}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-theme-border/30 hover:bg-theme-border/50 text-theme-text-primary text-xs font-semibold rounded-xl transition-all cursor-pointer border border-theme-border/40"
              title="Download a full CSV backup of every member in the directory"
            >
              <Download className="h-4 w-4" />
              Download Backup (CSV)
            </button>

            <button
              onClick={handleDownloadTemplate}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-theme-border/30 hover:bg-theme-border/50 text-theme-text-primary text-xs font-semibold rounded-xl transition-all cursor-pointer border border-theme-border/40"
              title="Download CSV Template"
            >
              <Download className="h-4 w-4" />
              Download Template
            </button>

            <button
              onClick={handleUploadClick}
              {...csvDragHandlers}
              className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl transition-all cursor-pointer border ${
                isCsvDragOver
                  ? 'border-accent bg-accent/10 shadow-md shadow-accent/20 ring-2 ring-accent/20 text-accent'
                  : 'border-theme-border/40 bg-theme-border/30 hover:bg-theme-border/50 text-theme-text-primary'
              }`}
              title="Upload Filled CSV File — click or drag and drop"
            >
              <Upload className="h-4 w-4" />
              {isCsvDragOver ? 'Drop CSV here' : 'Upload Roster (CSV)'}
            </button>
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileUpload} 
              accept=".csv" 
              className="hidden" 
            />

            <button
              onClick={() => setIsModalOpen(true)}
              className="flex items-center gap-1.5 px-4 py-2 bg-accent hover:bg-primary-light text-white text-xs font-semibold rounded-xl transition-all shadow-md shadow-accent/15 cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              Add Member
            </button>
          </div>
        )}
      </div>

      {/* Division Category Selector Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-3 pt-1 border-b border-theme-border/30 text-xs font-semibold scrollbar-none max-w-full -mx-2 px-2 sm:mx-0 sm:px-0">
        <button
          onClick={() => { setSelectedDivision('ALL'); setCurrentPage(1); }}
          className={`px-3.5 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shrink-0 whitespace-nowrap ${
            selectedDivision === 'ALL'
              ? 'bg-accent text-white shadow-sm'
              : 'bg-theme-border/20 text-theme-text-secondary hover:text-theme-text-primary'
          }`}
        >
          <Users className="h-3.5 w-3.5" />
          All Members ({members.length})
        </button>

        <button
          onClick={() => { setSelectedDivision('Advisory Board'); setCurrentPage(1); }}
          className={`px-3.5 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shrink-0 whitespace-nowrap ${
            selectedDivision === 'Advisory Board'
              ? 'bg-accent text-white shadow-sm'
              : 'bg-theme-border/20 text-theme-text-secondary hover:text-theme-text-primary'
          }`}
        >
          <ShieldCheck className="h-3.5 w-3.5 text-warning" />
          Advisory Board ({advisoryCount})
        </button>

        <button
          onClick={() => { setSelectedDivision('Faculty'); setCurrentPage(1); }}
          className={`px-3.5 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shrink-0 whitespace-nowrap ${
            selectedDivision === 'Faculty'
              ? 'bg-accent text-white shadow-sm'
              : 'bg-theme-border/20 text-theme-text-secondary hover:text-theme-text-primary'
          }`}
        >
          <BookOpen className="h-3.5 w-3.5 text-cyan-400" />
          Faculty ({facultyCount})
        </button>

        <button
          onClick={() => { setSelectedDivision('Core Committee'); setCurrentPage(1); }}
          className={`px-3.5 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shrink-0 whitespace-nowrap ${
            selectedDivision === 'Core Committee'
              ? 'bg-accent text-white shadow-sm'
              : 'bg-theme-border/20 text-theme-text-secondary hover:text-theme-text-primary'
          }`}
        >
          <Award className="h-3.5 w-3.5 text-accent" />
          Core Committee ({coreCount})
        </button>

        <button
          onClick={() => { setSelectedDivision('Training Associate'); setCurrentPage(1); }}
          className={`px-3.5 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shrink-0 whitespace-nowrap ${
            selectedDivision === 'Training Associate'
              ? 'bg-accent text-white shadow-sm'
              : 'bg-theme-border/20 text-theme-text-secondary hover:text-theme-text-primary'
          }`}
        >
          <UserCheck className="h-3.5 w-3.5 text-success" />
          Training Associates ({trainingCount})
        </button>

        <button
          onClick={() => { setSelectedDivision('Alumni'); setCurrentPage(1); }}
          className={`px-3.5 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shrink-0 whitespace-nowrap ${
            selectedDivision === 'Alumni'
              ? 'bg-accent text-white shadow-sm'
              : 'bg-theme-border/20 text-theme-text-secondary hover:text-theme-text-primary'
          }`}
        >
          <GraduationCap className="h-3.5 w-3.5 text-purple-400" />
          Alumni Mentors ({alumniCount})
        </button>

        {terminatedCount > 0 && (
          <button
            onClick={() => { setSelectedDivision('TERMINATED'); setCurrentPage(1); }}
            className={`px-3.5 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shrink-0 whitespace-nowrap ${
              selectedDivision === 'TERMINATED'
                ? 'bg-accent text-white shadow-sm'
                : 'bg-theme-border/20 text-theme-text-secondary hover:text-theme-text-primary'
            }`}
          >
            <ShieldOff className="h-3.5 w-3.5 text-danger" />
            Terminated ({terminatedCount})
          </button>
        )}
      </div>

      {/* Filter Bar & Search */}
      <div className="glass-panel rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-1">
          <Search className="h-4.5 w-4.5 text-theme-text-secondary shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            placeholder="Search directory by name, email, designation, or division..."
            className="w-full bg-transparent border-0 focus:outline-none focus:ring-0 text-xs text-theme-text-primary placeholder-theme-text-secondary"
          />
        </div>

        <div className="flex items-center gap-3 text-xs text-theme-text-secondary">
          <span>Rows per page:</span>
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setCurrentPage(1);
            }}
            className="px-2 py-1 bg-theme-background/40 border border-theme-border/40 rounded-lg text-xs text-theme-text-primary focus:outline-none"
          >
            <option value={10}>10</option>
            <option value={15}>15</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
          </select>
          <span className="font-semibold text-theme-text-primary">{filteredMembers.length} members</span>
        </div>
      </div>

      {/* Directory Table */}
      <div className="glass-panel rounded-2xl p-6 overflow-hidden space-y-4">
        <div className="overflow-x-auto">
          {filteredMembers.length === 0 ? (
            <div className="text-center py-12 text-theme-text-secondary text-xs">
              No matching members found in the directory.
            </div>
          ) : (
            <table className="min-w-full text-xs text-left">
              <thead>
                <tr className="text-theme-text-secondary border-b border-theme-border/40 text-xs">
                  <th className="pb-3.5 pl-2 pr-2 w-10 text-center select-none">
                    <button
                      type="button"
                      onClick={toggleSelectAllPage}
                      className="p-1 hover:text-accent transition-colors cursor-pointer"
                      title={allPaginatedSelected ? 'Deselect all on this page' : 'Select all on this page'}
                    >
                      {allPaginatedSelected ? (
                        <CheckSquare className="h-4 w-4 text-accent" />
                      ) : somePaginatedSelected ? (
                        <MinusSquare className="h-4 w-4 text-accent" />
                      ) : (
                        <Square className="h-4 w-4 opacity-50 hover:opacity-100" />
                      )}
                    </button>
                  </th>
                  <th 
                    onClick={() => toggleSort('name')}
                    className="pb-3.5 pr-4 font-semibold cursor-pointer hover:text-theme-text-primary select-none"
                  >
                    <span className="flex items-center gap-1">
                      Name <ArrowUpDown className="h-3 w-3" />
                    </span>
                  </th>
                  <th 
                    onClick={() => toggleSort('email')}
                    className="pb-3.5 pr-4 font-semibold cursor-pointer hover:text-theme-text-primary select-none"
                  >
                    <span className="flex items-center gap-1">
                      Email Address <ArrowUpDown className="h-3 w-3" />
                    </span>
                  </th>
                  <th 
                    onClick={() => toggleSort('division')}
                    className="pb-3.5 pr-4 font-semibold cursor-pointer hover:text-theme-text-primary select-none"
                  >
                    <span className="flex items-center gap-1">
                      Organization Division <ArrowUpDown className="h-3 w-3" />
                    </span>
                  </th>
                  <th 
                    onClick={() => toggleSort('role')}
                    className="pb-3.5 pr-4 font-semibold cursor-pointer hover:text-theme-text-primary select-none"
                  >
                    <span className="flex items-center gap-1">
                      Designation / Role <ArrowUpDown className="h-3 w-3" />
                    </span>
                  </th>
                  <th
                    onClick={() => toggleSort('department')}
                    className="pb-3.5 pr-4 font-semibold cursor-pointer hover:text-theme-text-primary select-none"
                  >
                    <span className="flex items-center gap-1">
                      Department <ArrowUpDown className="h-3 w-3" />
                    </span>
                  </th>
                  <th
                    onClick={() => toggleSort('program')}
                    className="pb-3.5 pr-4 font-semibold cursor-pointer hover:text-theme-text-primary select-none"
                  >
                    <span className="flex items-center gap-1">
                      Program <ArrowUpDown className="h-3 w-3" />
                    </span>
                  </th>
                  <th className="pb-3.5 font-semibold text-right pr-2">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-theme-border/20">
                {paginatedMembers.map(member => {
                  const isSelected = selectedMemberIds.includes(member.id);

                  return (
                    <tr 
                      key={member.id} 
                      onClick={() => toggleSelectMember(member.id)}
                      className={`hover:bg-accent/5 transition-all text-xs cursor-pointer select-none ${
                        isSelected ? 'backdrop-blur-md bg-white/10 dark:bg-white/5 border-l-2 border-l-accent shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]' : ''
                      }`}
                    >
                      <td className="py-3.5 pl-2 pr-2 text-center" onClick={(e) => toggleSelectMember(member.id, e)}>
                        <button
                          type="button"
                          className="p-1 hover:text-accent transition-colors cursor-pointer"
                        >
                          {isSelected ? (
                            <CheckSquare className="h-4 w-4 text-accent" />
                          ) : (
                            <Square className="h-4 w-4 text-theme-text-secondary/60 hover:text-accent" />
                          )}
                        </button>
                      </td>
                      <td className="py-3.5 pr-4 font-bold text-theme-text-primary flex items-center gap-2.5">
                        <div className="h-8 w-8 bg-accent/15 rounded-xl flex items-center justify-center border border-accent/20 shrink-0">
                          <span className="text-[11px] font-bold text-accent">
                            {member.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <span className="flex items-center gap-1.5">
                            {member.name}
                            {member.status === 'Terminated' && (
                              <span
                                className="inline-flex items-center text-[9px] font-semibold px-1.5 py-0.5 rounded-full border bg-danger/15 text-danger border-danger/30"
                                title={member.terminatedAt ? `Terminated ${new Date(member.terminatedAt).toLocaleDateString()}${member.terminatedBy ? ` by ${member.terminatedBy}` : ''}` : 'Terminated'}
                              >
                                Terminated
                              </span>
                            )}
                            {member.status !== 'Terminated' && !member.passwordHash && (
                              <span
                                className="inline-flex items-center text-[9px] font-semibold px-1.5 py-0.5 rounded-full border bg-warning/15 text-warning border-warning/30"
                                title="This member hasn't set up their password yet — they were sent a welcome email with an activation link."
                              >
                                Activation Pending
                              </span>
                            )}
                            {member.status !== 'Terminated' && member.mustSetupPassword && (
                              <span
                                className="inline-flex items-center gap-1 text-[9px] font-semibold px-1.5 py-0.5 rounded-full border bg-amber-500/15 text-amber-400 border-amber-500/30"
                                title="Super User requested this member to set up a new password on their next login attempt without requiring an OTP."
                              >
                                <KeyRound className="h-2.5 w-2.5" />
                                Reset Pending
                              </span>
                            )}
                          </span>
                          {member.batch && (
                            <span className="block text-[10px] text-theme-text-secondary font-normal">{member.batch}</span>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 pr-4 text-theme-text-secondary">{member.email}</td>
                      <td className="py-3.5 pr-4">
                        <span className={`inline-flex items-center text-[10px] font-semibold px-2.5 py-0.5 rounded-full border ${
                          member.division === 'Advisory Board' ? 'bg-amber-500/15 text-amber-400 border-amber-500/30' :
                          member.division === 'Faculty' ? 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30' :
                          member.division === 'Core Committee' ? 'bg-accent/15 text-accent border-accent/30' :
                          member.division === 'Alumni' ? 'bg-purple-500/15 text-purple-400 border-purple-500/30' :
                          'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                        }`}>
                          {member.division}
                        </span>
                      </td>
                      <td className="py-3.5 pr-4 text-theme-text-secondary">{member.role}</td>
                      <td className="py-3.5 pr-4 text-theme-text-secondary">{member.department || '—'}</td>
                      <td className="py-3.5 pr-4 text-theme-text-secondary">{member.program || '—'}</td>
                      <td className="py-3.5 text-right pr-2" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end items-center gap-1">
                          <button
                            onClick={() => setSelectedStudentForProfile(member.id)}
                            className="p-1.5 text-accent hover:bg-accent/10 rounded-lg transition-all cursor-pointer flex items-center gap-1"
                            title="View Student Profile & Outcomes"
                          >
                            <Eye className="h-4 w-4" />
                            <span className="text-[11px] font-semibold hidden sm:inline">Profile</span>
                          </button>
                          
                          {canEditMemberRecordRow(member, user) && (
                            <button
                              onClick={() => startEdit(member)}
                              className="p-1.5 text-theme-text-secondary hover:text-accent hover:bg-theme-border/20 rounded-lg transition-all cursor-pointer"
                              title={
                                isRestrictedDirectoryEditor(user)
                                  ? 'Edit Member — one-time correction window, within 24 hours of adding this record'
                                  : 'Edit Member'
                              }
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </button>
                          )}

                          {isAdmin && (
                            <>
                              {member.status !== 'Terminated' && (
                                <button
                                  onClick={() => setPasswordResetModalMember(member)}
                                  className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                                    member.mustSetupPassword
                                      ? 'text-amber-400 bg-amber-500/15 border border-amber-500/30 hover:bg-amber-500/25'
                                      : 'text-theme-text-secondary hover:text-amber-400 hover:bg-amber-500/10'
                                  }`}
                                  title={member.mustSetupPassword ? "Cancel Password Reset Request" : "Ask Member to Set Up Password (Admin Override - No OTP on Login)"}
                                >
                                  <KeyRound className="h-3.5 w-3.5" />
                                </button>
                              )}

                              {canSetMemberPassword(user) && member.status !== 'Terminated' && (
                                <button
                                  onClick={() => {
                                    setSetPasswordModalMember(member);
                                    setNewPasswordValue('');
                                    setSetPasswordError('');
                                    setShowNewPassword(false);
                                  }}
                                  className="p-1.5 text-theme-text-secondary hover:text-danger hover:bg-danger/10 rounded-lg transition-all cursor-pointer"
                                  title="Set Password Directly (Super User Only)"
                                >
                                  <Lock className="h-3.5 w-3.5" />
                                </button>
                              )}

                              {member.status !== 'Terminated' && !member.passwordHash && (
                                <button
                                  onClick={() => handleResendActivation(member)}
                                  disabled={resendingMemberId === member.id}
                                  className="p-1.5 text-warning hover:bg-warning/10 rounded-lg transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                  title="Resend Welcome Email"
                                >
                                  {resendingMemberId === member.id ? (
                                    <span className="block h-3.5 w-3.5 border-2 border-warning border-t-transparent rounded-full animate-spin" />
                                  ) : (
                                    <Mail className="h-3.5 w-3.5" />
                                  )}
                                </button>
                              )}

                              {/* Never allow deleting yourself. Otherwise, a
                                  Super User row is normally protected — except
                                  for Kayomarz Pavri, who can delete any other
                                  user, Super User accounts included. */}
                              {member.id !== user?.id && (member.id !== 'm1' && member.tier !== 1 && member.role !== 'Super User' || isKayomarzPavri(user)) && (
                                <button
                                  onClick={() => setDeletingMember(member)}
                                  className="p-1.5 text-danger hover:bg-danger/10 rounded-lg transition-all cursor-pointer"
                                  title={member.tier === 1 || member.role === 'Super User' ? 'Remove Member (Super User override)' : 'Remove Member'}
                                >
                                  <UserMinus className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </>
                          )}

                          {isCentreHead(user) && member.id !== 'm1' && (
                            member.status === 'Terminated' ? (
                              <button
                                onClick={() => setReactivatingMember(member)}
                                className="p-1.5 text-success hover:bg-success/10 rounded-lg transition-all cursor-pointer"
                                title="Reactivate Member"
                              >
                                <UserCheck className="h-3.5 w-3.5" />
                              </button>
                            ) : (
                              <button
                                onClick={() => setTerminatingMember(member)}
                                className="p-1.5 text-danger hover:bg-danger/10 rounded-lg transition-all cursor-pointer"
                                title="Terminate Member (revoke dashboard access)"
                              >
                                <UserX className="h-3.5 w-3.5" />
                              </button>
                            )
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination Navigation */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-3 border-t border-theme-border/20 text-xs">
            <span className="text-theme-text-secondary">
              Page <strong>{currentPage}</strong> of <strong>{totalPages}</strong>
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-1.5 rounded-lg border border-theme-border/30 hover:bg-theme-border/30 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer text-theme-text-primary"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-1.5 rounded-lg border border-theme-border/30 hover:bg-theme-border/30 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer text-theme-text-primary"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Add Member Modal */}
      {isModalOpen && (() => {
        const preview = deriveMemberRoleAndDepartment(division, {
          facultyPosition,
          campus,
          corePosition,
          departmentSelect,
          associatePosition,
        });

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="glass-panel w-full max-w-lg rounded-3xl p-6 flex flex-col space-y-5 relative border border-white/15 shadow-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-theme-text-primary">Add Member to Organization</h2>
                  <p className="text-[11px] text-theme-text-secondary">Enrolling a new member into the organization directory</p>
                </div>
                <button 
                  onClick={() => setIsModalOpen(false)}
                  className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-theme-border/30 text-theme-text-secondary hover:text-theme-text-primary transition-all cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleCreateMember} className="space-y-4 text-xs">
                <div className="space-y-1.5">
                  <label className="block font-medium text-theme-text-secondary">Full Name *</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Ananya Sharma"
                    className="w-full px-4 py-2.5 bg-theme-background/30 border border-theme-card-border rounded-xl text-theme-text-primary focus:outline-none focus:border-accent"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block font-medium text-theme-text-secondary">Email Address *</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="ananya.s@msruas.ac.in"
                    className="w-full px-4 py-2.5 bg-theme-background/30 border border-theme-card-border rounded-xl text-theme-text-primary focus:outline-none focus:border-accent"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="block font-medium text-theme-text-secondary">Organization Division</label>
                    <select
                      value={division}
                      onChange={(e) => setDivision(e.target.value as MemberDivision)}
                      className="w-full px-4 py-2.5 bg-theme-background/30 border border-theme-card-border rounded-xl text-theme-text-primary focus:outline-none focus:border-accent font-semibold"
                    >
                      <option value="Faculty">Faculty</option>
                      <option value="Core Committee">Core Committee</option>
                      <option value="Advisory Board">Advisory Board</option>
                      <option value="Training Associate">Training Associate</option>
                      <option value="Alumni">Alumni</option>
                    </select>
                  </div>

                  {/* Position Selection based on Division */}
                  {division === 'Faculty' && (
                    <div className="space-y-1.5">
                      <label className="block font-medium text-theme-text-secondary">Faculty Position</label>
                      <select
                        value={facultyPosition}
                        onChange={(e) => setFacultyPosition(e.target.value as FacultyPosition)}
                        className="w-full px-4 py-2.5 bg-theme-background/30 border border-theme-card-border rounded-xl text-theme-text-primary focus:outline-none focus:border-accent"
                      >
                        <option value="Events Head">Events Head</option>
                        <option value="Industrial Connects">Industrial Connects</option>
                        <option value="Finance Head">Finance Head</option>
                        <option value="Centre Head">Centre Head</option>
                        <option value="Advisor">Advisor</option>
                      </select>
                    </div>
                  )}

                  {(division === 'Core Committee' || division === 'Advisory Board') && (
                    <div className="space-y-1.5">
                      <label className="block font-medium text-theme-text-secondary">Position / Role</label>
                      <select
                        value={corePosition}
                        onChange={(e) => setCorePosition(e.target.value as CorePosition)}
                        className="w-full px-4 py-2.5 bg-theme-background/30 border border-theme-card-border rounded-xl text-theme-text-primary focus:outline-none focus:border-accent"
                      >
                        <option value="Department Head">Department Head</option>
                        <option value="President">President</option>
                        <option value="Vice President">Vice President</option>
                        <option value="General Secretary">General Secretary</option>
                        <option value="Chief Coordinator">Chief Coordinator</option>
                      </select>
                    </div>
                  )}

                  {division === 'Training Associate' && (
                    <div className="space-y-1.5">
                      <label className="block font-medium text-theme-text-secondary">Select Department *</label>
                      <select
                        value={departmentSelect}
                        onChange={(e) => setDepartmentSelect(e.target.value)}
                        className="w-full px-4 py-2.5 bg-theme-background/30 border border-theme-card-border rounded-xl text-theme-text-primary focus:outline-none focus:border-accent font-semibold"
                      >
                        {STANDARDIZED_DEPARTMENTS.map(dept => (
                          <option key={dept} value={dept}>{dept}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                {/* Sub-Selection for Events Head Campus */}
                {division === 'Faculty' && facultyPosition === 'Events Head' && (
                  <div className="space-y-1.5 p-3 bg-accent/5 border border-accent/20 rounded-xl">
                    <label className="block font-medium text-accent">Campus Sub-Selection</label>
                    <div className="flex items-center gap-4 pt-1">
                      <label className="flex items-center gap-2 cursor-pointer text-theme-text-primary font-medium">
                        <input
                          type="radio"
                          name="campus"
                          value="GG Campus"
                          checked={campus === 'GG Campus'}
                          onChange={() => setCampus('GG Campus')}
                          className="accent-accent"
                        />
                        GG Campus
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer text-theme-text-primary font-medium">
                        <input
                          type="radio"
                          name="campus"
                          value="RTC Campus"
                          checked={campus === 'RTC Campus'}
                          onChange={() => setCampus('RTC Campus')}
                          className="accent-accent"
                        />
                        RTC Campus
                      </label>
                    </div>
                  </div>
                )}

                {/* Department Selection for Department Heads */}
                {(division === 'Core Committee' || division === 'Advisory Board') && corePosition === 'Department Head' && (
                  <div className="space-y-1.5">
                    <label className="block font-medium text-theme-text-secondary">Select Department *</label>
                    <select
                      value={departmentSelect}
                      onChange={(e) => setDepartmentSelect(e.target.value)}
                      className="w-full px-4 py-2.5 bg-theme-background/30 border border-theme-card-border rounded-xl text-theme-text-primary focus:outline-none focus:border-accent font-semibold"
                    >
                      {STANDARDIZED_DEPARTMENTS.map(dept => (
                        <option key={dept} value={dept}>{dept}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Live Derived Designation Preview Banner */}
                <div className="p-3.5 bg-accent/10 border border-accent/30 rounded-2xl flex flex-col space-y-1">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-accent">Auto-Generated Designation</span>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-theme-text-primary">{preview.role}</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-accent/20 text-accent border border-accent/30">
                      Tier {preview.tier}
                    </span>
                  </div>
                  {preview.department && (
                    <span className="text-[11px] text-theme-text-secondary">Department: {preview.department}</span>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="block font-medium text-theme-text-secondary">Program (Optional)</label>
                  <input
                    type="text"
                    value={program}
                    onChange={(e) => setProgram(e.target.value)}
                    placeholder="e.g. B.Tech Computer Science Engineering, MBA"
                    className="w-full px-4 py-2.5 bg-theme-background/30 border border-theme-card-border rounded-xl text-theme-text-primary focus:outline-none focus:border-accent"
                  />
                </div>

                {division === 'Alumni' && (
                  <div className="space-y-1.5">
                    <label className="block font-medium text-theme-text-secondary">Graduating Class / Batch</label>
                    <input
                      type="text"
                      value={batch}
                      onChange={(e) => setBatch(e.target.value)}
                      placeholder="e.g. Class of 2024"
                      className="w-full px-4 py-2.5 bg-theme-background/30 border border-theme-card-border rounded-xl text-theme-text-primary focus:outline-none focus:border-accent"
                    />
                  </div>
                )}

                <button
                  type="submit"
                  className="w-full py-3 bg-accent hover:bg-primary-light text-white font-semibold rounded-xl transition-all shadow-md shadow-accent/15 cursor-pointer mt-4"
                >
                  Add Member to Organization
                </button>
              </form>
            </div>
          </div>
        );
      })()}

      {/* Edit Member Modal */}
      {editingMember && (() => {
        const preview = deriveMemberRoleAndDepartment(editDivision, {
          facultyPosition: editFacultyPosition,
          campus: editCampus,
          corePosition: editCorePosition,
          departmentSelect: editDepartmentSelect,
          associatePosition: editAssociatePosition,
        });

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="glass-panel w-full max-w-lg rounded-3xl p-6 flex flex-col space-y-5 relative border border-white/15 shadow-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-theme-text-primary">Edit Member Details</h2>
                  <p className="text-[11px] text-theme-text-secondary">Updating profile and designation for {editingMember.name}</p>
                </div>
                <button 
                  onClick={() => setEditingMember(null)}
                  className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-theme-border/30 text-theme-text-secondary hover:text-theme-text-primary transition-all cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleUpdateMember} className="space-y-4 text-xs">
                <div className="space-y-1.5">
                  <label className="block font-medium text-theme-text-secondary">Full Name *</label>
                  <input
                    type="text"
                    required
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full px-4 py-2.5 bg-theme-background/30 border border-theme-card-border rounded-xl text-theme-text-primary focus:outline-none focus:border-accent"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block font-medium text-theme-text-secondary">Email Address *</label>
                  <input
                    type="email"
                    required
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    className="w-full px-4 py-2.5 bg-theme-background/30 border border-theme-card-border rounded-xl text-theme-text-primary focus:outline-none focus:border-accent"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="block font-medium text-theme-text-secondary">Organization Division</label>
                    <select
                      value={editDivision}
                      onChange={(e) => setEditDivision(e.target.value as MemberDivision)}
                      className="w-full px-4 py-2.5 bg-theme-background/30 border border-theme-card-border rounded-xl text-theme-text-primary focus:outline-none focus:border-accent font-semibold"
                    >
                      <option value="Faculty">Faculty</option>
                      <option value="Core Committee">Core Committee</option>
                      <option value="Advisory Board">Advisory Board</option>
                      <option value="Training Associate">Training Associate</option>
                      <option value="Alumni">Alumni</option>
                    </select>
                  </div>

                  {/* Position Selection based on Division */}
                  {editDivision === 'Faculty' && (
                    <div className="space-y-1.5">
                      <label className="block font-medium text-theme-text-secondary">Faculty Position</label>
                      <select
                        value={editFacultyPosition}
                        onChange={(e) => setEditFacultyPosition(e.target.value as FacultyPosition)}
                        className="w-full px-4 py-2.5 bg-theme-background/30 border border-theme-card-border rounded-xl text-theme-text-primary focus:outline-none focus:border-accent"
                      >
                        <option value="Events Head">Events Head</option>
                        <option value="Industrial Connects">Industrial Connects</option>
                        <option value="Finance Head">Finance Head</option>
                        <option value="Centre Head">Centre Head</option>
                        <option value="Advisor">Advisor</option>
                      </select>
                    </div>
                  )}

                  {(editDivision === 'Core Committee' || editDivision === 'Advisory Board') && (
                    <div className="space-y-1.5">
                      <label className="block font-medium text-theme-text-secondary">Position / Role</label>
                      <select
                        value={editCorePosition}
                        onChange={(e) => setEditCorePosition(e.target.value as CorePosition)}
                        className="w-full px-4 py-2.5 bg-theme-background/30 border border-theme-card-border rounded-xl text-theme-text-primary focus:outline-none focus:border-accent"
                      >
                        <option value="Department Head">Department Head</option>
                        <option value="President">President</option>
                        <option value="Vice President">Vice President</option>
                        <option value="General Secretary">General Secretary</option>
                        <option value="Chief Coordinator">Chief Coordinator</option>
                      </select>
                    </div>
                  )}

                  {editDivision === 'Training Associate' && (
                    <div className="space-y-1.5">
                      <label className="block font-medium text-theme-text-secondary">Select Department *</label>
                      <select
                        value={editDepartmentSelect}
                        onChange={(e) => setEditDepartmentSelect(e.target.value)}
                        className="w-full px-4 py-2.5 bg-theme-background/30 border border-theme-card-border rounded-xl text-theme-text-primary focus:outline-none focus:border-accent font-semibold"
                      >
                        {STANDARDIZED_DEPARTMENTS.map(dept => (
                          <option key={dept} value={dept}>{dept}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                {/* Sub-Selection for Events Head Campus */}
                {editDivision === 'Faculty' && editFacultyPosition === 'Events Head' && (
                  <div className="space-y-1.5 p-3 bg-accent/5 border border-accent/20 rounded-xl">
                    <label className="block font-medium text-accent">Campus Sub-Selection</label>
                    <div className="flex items-center gap-4 pt-1">
                      <label className="flex items-center gap-2 cursor-pointer text-theme-text-primary font-medium">
                        <input
                          type="radio"
                          name="editCampus"
                          value="GG Campus"
                          checked={editCampus === 'GG Campus'}
                          onChange={() => setEditCampus('GG Campus')}
                          className="accent-accent"
                        />
                        GG Campus
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer text-theme-text-primary font-medium">
                        <input
                          type="radio"
                          name="editCampus"
                          value="RTC Campus"
                          checked={editCampus === 'RTC Campus'}
                          onChange={() => setEditCampus('RTC Campus')}
                          className="accent-accent"
                        />
                        RTC Campus
                      </label>
                    </div>
                  </div>
                )}

                {/* Department Selection for Department Heads */}
                {(editDivision === 'Core Committee' || editDivision === 'Advisory Board') && editCorePosition === 'Department Head' && (
                  <div className="space-y-1.5">
                    <label className="block font-medium text-theme-text-secondary">Select Department *</label>
                    <select
                      value={editDepartmentSelect}
                      onChange={(e) => setEditDepartmentSelect(e.target.value)}
                      className="w-full px-4 py-2.5 bg-theme-background/30 border border-theme-card-border rounded-xl text-theme-text-primary focus:outline-none focus:border-accent font-semibold"
                    >
                      {STANDARDIZED_DEPARTMENTS.map(dept => (
                        <option key={dept} value={dept}>{dept}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Live Derived Designation Preview Banner */}
                <div className="p-3.5 bg-accent/10 border border-accent/30 rounded-2xl flex flex-col space-y-1">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-accent">Auto-Generated Designation</span>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-theme-text-primary">{preview.role}</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-accent/20 text-accent border border-accent/30">
                      Tier {user?.tier === 1 ? editTierOverride : preview.tier}
                    </span>
                  </div>
                  {preview.department && (
                    <span className="text-[11px] text-theme-text-secondary">Department: {preview.department}</span>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="block font-medium text-theme-text-secondary">Program (Optional)</label>
                  <input
                    type="text"
                    value={editProgram}
                    onChange={(e) => setEditProgram(e.target.value)}
                    placeholder="e.g. B.Tech Computer Science Engineering, MBA"
                    className="w-full px-4 py-2.5 bg-theme-background/30 border border-theme-card-border rounded-xl text-theme-text-primary focus:outline-none focus:border-accent"
                  />
                </div>

                {user?.tier === 1 && (
                  <div className="space-y-1.5 p-3 bg-warning/5 border border-warning/20 rounded-xl">
                    <label className="flex items-center gap-1.5 font-medium text-warning">
                      <ShieldAlert className="h-3.5 w-3.5" />
                      Access Tier (Super User Override)
                    </label>
                    <select
                      value={editTierOverride}
                      onChange={(e) => setEditTierOverride(parseInt(e.target.value, 10))}
                      className="w-full px-4 py-2.5 bg-theme-background/30 border border-warning/30 rounded-xl text-theme-text-primary focus:outline-none focus:border-warning"
                    >
                      {TIER_LABELS.map(({ tier, label }) => (
                        <option key={tier} value={tier}>Tier {tier} — {label}</option>
                      ))}
                    </select>
                    <p className="text-[11px] text-theme-text-secondary">
                      Overrides the tier this member's division would normally assign. Takes effect immediately across every module — tasks, events, reimbursement approvals, and any Group Policy targeting by tier.
                    </p>
                  </div>
                )}

                {editDivision === 'Alumni' && (
                  <div className="space-y-1.5">
                    <label className="block font-medium text-theme-text-secondary">Graduating Class / Batch</label>
                    <input
                      type="text"
                      value={editBatch}
                      onChange={(e) => setEditBatch(e.target.value)}
                      placeholder="e.g. Class of 2024"
                      className="w-full px-4 py-2.5 bg-theme-background/30 border border-theme-card-border rounded-xl text-theme-text-primary focus:outline-none focus:border-accent"
                    />
                  </div>
                )}

                <button
                  type="submit"
                  className="w-full py-3 bg-accent hover:bg-primary-light text-white font-semibold rounded-xl transition-all shadow-md shadow-accent/15 cursor-pointer mt-4"
                >
                  Save Member Details
                </button>
              </form>
            </div>
          </div>
        );
      })()}

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={Boolean(deletingMember)}
        title="Remove Member from Organization"
        message={`Are you sure you want to remove ${deletingMember?.name} (${deletingMember?.email}) from the LEADS directory?`}
        confirmLabel="Remove Member"
        variant="danger"
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeletingMember(null)}
      />

      {/* Terminate Member Modal — reason required, sent in the official notification email */}
      {terminatingMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="glass-panel w-full max-w-md rounded-3xl p-6 flex flex-col space-y-5 relative border border-white/15 shadow-2xl">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-danger/15 text-danger">
                  <ShieldOff className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-theme-text-primary">Terminate Member</h3>
                  <p className="text-xs text-theme-text-secondary mt-0.5">{terminatingMember.name} ({terminatingMember.email})</p>
                </div>
              </div>
              <button
                onClick={() => { setTerminatingMember(null); setTerminationReason(''); setTerminationError(''); }}
                className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-theme-border/30 text-theme-text-secondary hover:text-theme-text-primary transition-all cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-xs text-theme-text-secondary leading-relaxed bg-theme-background/30 p-3.5 rounded-xl border border-theme-border/30">
              This member will immediately lose access to the dashboard and will not be able to log in. Their existing tasks, ratings, and other records will remain unchanged, and you can restore their access at any time. Terminating a member&apos;s access is restricted to the Centre Head only.
            </p>

            {terminationError && (
              <div className="flex gap-2.5 p-3 bg-danger/15 border border-danger/30 rounded-xl text-danger text-xs leading-relaxed">
                <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{terminationError}</span>
              </div>
            )}

            <div className="space-y-1.5 text-xs">
              <label className="block font-medium text-theme-text-secondary">Reason for Termination *</label>
              <textarea
                value={terminationReason}
                onChange={(e) => { setTerminationReason(e.target.value); setTerminationError(''); }}
                placeholder="Explain why this member's access is being terminated..."
                rows={3}
                className="w-full px-4 py-2.5 bg-theme-background/30 border border-theme-card-border rounded-xl text-theme-text-primary focus:outline-none focus:border-accent"
              />
              <p className="text-[11px] text-theme-text-secondary">This reason will be included in the official termination notification email sent to the member.</p>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                onClick={() => { setTerminatingMember(null); setTerminationReason(''); setTerminationError(''); }}
                className="px-4 py-2.5 text-xs font-semibold text-theme-text-primary bg-theme-border/30 hover:bg-theme-border/50 rounded-xl transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmTerminate}
                className="px-4 py-2.5 text-xs font-semibold rounded-xl transition-all shadow-md cursor-pointer bg-red-600 hover:bg-red-700 text-white shadow-red-600/20"
              >
                Terminate Access
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reactivate Member Confirmation Modal */}
      <ConfirmModal
        isOpen={Boolean(reactivatingMember)}
        title="Reactivate Member Access"
        message={`${reactivatingMember?.name} (${reactivatingMember?.email}) will be able to log in to the dashboard again immediately.`}
        confirmLabel="Reactivate Access"
        variant="primary"
        onConfirm={handleConfirmReactivate}
        onCancel={() => setReactivatingMember(null)}
      />

      {/* Bulk Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={isBulkDeleteModalOpen}
        title={`Remove ${selectedMemberIds.length} Members`}
        message={`Are you sure you want to remove all ${selectedMemberIds.length} selected members from the LEADS organization directory? This action cannot be undone.`}
        confirmLabel={`Remove ${selectedMemberIds.length} Members`}
        variant="danger"
        onConfirm={handleConfirmBulkDelete}
        onCancel={() => setIsBulkDeleteModalOpen(false)}
      />

      {/* Student Profile Modal */}
      <StudentProfileModal
        memberIdOrName={selectedStudentForProfile}
        onClose={() => setSelectedStudentForProfile(null)}
      />

      {/* Floating Bulk Actions Toolbar */}
      {selectedMemberIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-11/12 max-w-4xl glass-panel backdrop-blur-xl bg-theme-card/60 border border-accent/40 shadow-2xl rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4 animate-in slide-in-from-bottom-5 duration-300">
          <div className="flex items-center gap-3">
            <div className="px-3 py-1.5 bg-accent/20 border border-accent/40 text-accent font-bold rounded-xl text-xs flex items-center gap-2">
              <CheckSquare className="h-4 w-4" />
              <span>{selectedMemberIds.length} Selected</span>
            </div>
            {selectedMemberIds.length < filteredMembers.length && (
              <button
                type="button"
                onClick={handleSelectAllFiltered}
                className="text-xs text-accent hover:underline font-semibold cursor-pointer hidden md:inline"
              >
                Select all {filteredMembers.length} matching members
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isAdmin && (
              <>
                <div className="relative">
                  <select
                    onChange={(e) => {
                      if (e.target.value) {
                        handleBulkMoveDivision(e.target.value as MemberDivision);
                        e.target.value = '';
                      }
                    }}
                    defaultValue=""
                    className="px-3 py-1.5 bg-theme-background/60 border border-theme-border/50 rounded-xl text-xs font-semibold text-theme-text-primary focus:outline-none focus:border-accent cursor-pointer"
                  >
                    <option value="" disabled>Move Division...</option>
                    <option value="Advisory Board">Advisory Board</option>
                    <option value="Faculty">Faculty</option>
                    <option value="Core Committee">Core Committee</option>
                    <option value="Training Associate">Training Associate</option>
                    <option value="Alumni">Alumni</option>
                  </select>
                </div>

                <button
                  type="button"
                  onClick={() => setIsBulkEditModalOpen(true)}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 bg-accent hover:bg-primary-light text-white text-xs font-semibold rounded-xl transition-all shadow-sm cursor-pointer"
                  title="Apply uniform standard changes to selected members"
                >
                  <Layers className="h-3.5 w-3.5" />
                  Uniform Bulk Edit
                </button>
              </>
            )}

            <button
              type="button"
              onClick={handleBulkExportCSV}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-theme-border/30 hover:bg-theme-border/50 text-theme-text-primary text-xs font-semibold rounded-xl transition-all border border-theme-border/40 cursor-pointer"
              title="Export selected members to CSV"
            >
              <Download className="h-3.5 w-3.5" />
              Export Selected
            </button>

            {isAdmin && (
              <button
                type="button"
                onClick={() => setIsBulkDeleteModalOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-danger/15 hover:bg-danger/25 text-danger border border-danger/30 text-xs font-semibold rounded-xl transition-all cursor-pointer"
                title="Remove selected members"
              >
                <UserMinus className="h-3.5 w-3.5" />
                Delete ({selectedMemberIds.length})
              </button>
            )}

            <button
              type="button"
              onClick={handleClearSelection}
              className="p-1.5 text-theme-text-secondary hover:text-theme-text-primary hover:bg-theme-border/20 rounded-xl transition-all cursor-pointer"
              title="Clear Selection"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Uniform Bulk Edit Modal */}
      {isBulkEditModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="glass-panel w-full max-w-lg rounded-2xl p-6 border border-theme-card-border shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-theme-border/30 pb-4">
              <div>
                <h3 className="text-base font-bold text-theme-text-primary flex items-center gap-2">
                  <Layers className="h-5 w-5 text-accent" />
                  Uniform Standard Change ({selectedMemberIds.length} Members)
                </h3>
                <p className="text-xs text-theme-text-secondary">Apply synchronized updates across all selected members</p>
              </div>
              <button
                onClick={() => setIsBulkEditModalOpen(false)}
                className="p-1.5 text-theme-text-secondary hover:text-theme-text-primary rounded-lg transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleApplyBulkEdit} className="space-y-4 text-xs">
              {/* Division Update */}
              <div className="p-3.5 bg-theme-border/10 border border-theme-border/20 rounded-xl space-y-2">
                <label className="flex items-center gap-2 font-semibold text-theme-text-primary cursor-pointer">
                  <input
                    type="checkbox"
                    checked={applyDivision}
                    onChange={(e) => setApplyDivision(e.target.checked)}
                    className="rounded accent-accent h-4 w-4 cursor-pointer"
                  />
                  <span>Change Organization Division</span>
                </label>
                {applyDivision && (
                  <select
                    value={bulkDivision}
                    onChange={(e) => setBulkDivision(e.target.value as MemberDivision)}
                    className="w-full px-3 py-2 bg-theme-background/60 border border-theme-card-border rounded-xl text-theme-text-primary focus:outline-none focus:border-accent font-medium mt-1"
                    required={applyDivision}
                  >
                    <option value="" disabled>Select target division...</option>
                    <option value="Advisory Board">Advisory Board</option>
                    <option value="Faculty">Faculty</option>
                    <option value="Core Committee">Core Committee</option>
                    <option value="Training Associate">Training Associate</option>
                    <option value="Alumni">Alumni</option>
                  </select>
                )}
              </div>

              {/* Designation / Role Update */}
              <div className="p-3.5 bg-theme-border/10 border border-theme-border/20 rounded-xl space-y-2">
                <label className="flex items-center gap-2 font-semibold text-theme-text-primary cursor-pointer">
                  <input
                    type="checkbox"
                    checked={applyRole}
                    onChange={(e) => setApplyRole(e.target.checked)}
                    className="rounded accent-accent h-4 w-4 cursor-pointer"
                  />
                  <span>Set Uniform Designation / Role</span>
                </label>
                {applyRole && (
                  <input
                    type="text"
                    value={bulkRole}
                    onChange={(e) => setBulkRole(e.target.value)}
                    placeholder="e.g. Senior Associate, Event Coordinator"
                    className="w-full px-3 py-2 bg-theme-background/60 border border-theme-card-border rounded-xl text-theme-text-primary focus:outline-none focus:border-accent mt-1"
                    required={applyRole}
                  />
                )}
              </div>

              {/* Batch Update */}
              <div className="p-3.5 bg-theme-border/10 border border-theme-border/20 rounded-xl space-y-2">
                <label className="flex items-center gap-2 font-semibold text-theme-text-primary cursor-pointer">
                  <input
                    type="checkbox"
                    checked={applyBatch}
                    onChange={(e) => setApplyBatch(e.target.checked)}
                    className="rounded accent-accent h-4 w-4 cursor-pointer"
                  />
                  <span>Set Graduating Class / Batch</span>
                </label>
                {applyBatch && (
                  <input
                    type="text"
                    value={bulkBatch}
                    onChange={(e) => setBulkBatch(e.target.value)}
                    placeholder="e.g. Class of 2025"
                    className="w-full px-3 py-2 bg-theme-background/60 border border-theme-card-border rounded-xl text-theme-text-primary focus:outline-none focus:border-accent mt-1"
                  />
                )}
              </div>

              {/* Selected Members Preview */}
              <div className="space-y-1.5 pt-1">
                <span className="font-semibold text-theme-text-secondary text-[11px]">Selected Members Preview:</span>
                <div className="max-h-24 overflow-y-auto flex flex-wrap gap-1 p-2 bg-theme-background/40 border border-theme-border/20 rounded-xl">
                  {members.filter(m => selectedMemberIds.includes(m.id)).map(m => (
                    <span key={m.id} className="text-[10px] px-2 py-0.5 bg-accent/15 text-theme-text-primary border border-accent/20 rounded-md">
                      {m.name}
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-theme-border/30">
                <button
                  type="button"
                  onClick={() => setIsBulkEditModalOpen(false)}
                  className="px-4 py-2 bg-theme-border/30 hover:bg-theme-border/50 text-theme-text-primary font-semibold rounded-xl text-xs cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-accent hover:bg-primary-light text-white font-semibold rounded-xl text-xs shadow-md shadow-accent/15 cursor-pointer"
                >
                  Apply to {selectedMemberIds.length} Members
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Password Reset Request (Admin Override) Confirmation Modal */}
      {passwordResetModalMember && (
        <ConfirmModal
          isOpen={!!passwordResetModalMember}
          title={passwordResetModalMember.mustSetupPassword ? "Cancel Password Reset Request" : "Request Member Password Setup (Admin Override)"}
          message={
            passwordResetModalMember.mustSetupPassword
              ? `Are you sure you want to cancel the password reset request for ${passwordResetModalMember.name}? They will resume normal login.`
              : `Are you sure you want to require ${passwordResetModalMember.name} (${passwordResetModalMember.email}) to set up a new password? On their next login attempt, an admin override will prompt them to set a new password directly without an OTP code.`
          }
          confirmLabel={passwordResetModalMember.mustSetupPassword ? "Cancel Request" : "Enable Password Setup Override"}
          variant={passwordResetModalMember.mustSetupPassword ? "warning" : "primary"}
          onConfirm={handleConfirmPasswordResetToggle}
          onCancel={() => setPasswordResetModalMember(null)}
        />
      )}

      {/* Set Password Directly (Super User Only) Modal */}
      {setPasswordModalMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="glass-panel w-full max-w-md rounded-2xl p-6 border border-theme-card-border shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-theme-border/30 pb-4">
              <div>
                <h3 className="text-base font-bold text-theme-text-primary flex items-center gap-2">
                  <Lock className="h-5 w-5 text-danger" />
                  Set Password Directly
                </h3>
                <p className="text-xs text-theme-text-secondary mt-0.5">
                  Super User override — takes effect immediately for {setPasswordModalMember.name} ({setPasswordModalMember.email}), no OTP or self-setup required.
                </p>
              </div>
              <button
                onClick={() => setSetPasswordModalMember(null)}
                className="p-1.5 text-theme-text-secondary hover:text-theme-text-primary rounded-lg transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmSetPassword} className="space-y-4 text-xs">
              <div className="flex items-start gap-2 p-3 bg-danger/5 border border-danger/25 rounded-xl text-[11px] text-theme-text-secondary">
                <ShieldAlert className="h-3.5 w-3.5 text-danger shrink-0 mt-0.5" />
                <span>This immediately replaces {setPasswordModalMember.name}&apos;s password. Share the new password with them through a secure channel.</span>
              </div>

              <div className="space-y-1.5">
                <label className="block font-medium text-theme-text-secondary">New Password</label>
                <div className="relative">
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    required
                    minLength={4}
                    autoFocus
                    value={newPasswordValue}
                    onChange={(e) => setNewPasswordValue(e.target.value)}
                    placeholder="Minimum 4 characters"
                    className="w-full pl-4 pr-10 py-2.5 bg-theme-background/40 border border-theme-card-border rounded-xl text-theme-text-primary focus:outline-none focus:border-accent"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3 top-3 text-theme-text-secondary hover:text-theme-text-primary"
                  >
                    {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {setPasswordError && (
                <p className="text-[11px] text-danger">{setPasswordError}</p>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-theme-border/30">
                <button
                  type="button"
                  onClick={() => setSetPasswordModalMember(null)}
                  className="px-4 py-2 bg-theme-border/30 hover:bg-theme-border/50 text-theme-text-primary font-semibold rounded-xl text-xs cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSettingPassword}
                  className="px-5 py-2 bg-danger hover:bg-red-600 text-white font-semibold rounded-xl text-xs shadow-md shadow-danger/15 cursor-pointer disabled:opacity-50"
                >
                  {isSettingPassword ? 'Setting Password...' : 'Set Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Account Activation & One-Time Password Setup Link Modal */}
      {activationModalData && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-theme-card border border-theme-card-border rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl relative">
            <button
              onClick={() => setActivationModalData(null)}
              className="absolute top-4 right-4 text-theme-text-secondary hover:text-theme-text-primary p-1 rounded-lg transition-all cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-accent/15 border border-accent/30 flex items-center justify-center text-accent">
                <Key className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-theme-text-primary leading-tight">
                  Account Activation & One-Time Password Setup
                </h2>
                <p className="text-xs text-theme-text-secondary">
                  Send, copy, or override password setup for <strong className="text-theme-text-primary">{activationModalData.member.name}</strong>
                </p>
              </div>
            </div>

            <div className="bg-accent/10 border border-accent/20 p-3.5 rounded-xl space-y-1 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-theme-text-primary">{activationModalData.member.name}</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-warning/20 text-warning border border-warning/30">
                  Activation Pending
                </span>
              </div>
              <p className="text-theme-text-secondary text-[11px]">{activationModalData.member.email} • {activationModalData.member.role}</p>
              <p className="text-emerald-400 text-[11px] font-medium pt-1 flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" /> Welcome email with password setup link dispatched automatically.
              </p>
            </div>

            {/* One-Time Password Setup Link Box */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-theme-text-primary flex items-center justify-between">
                <span>Account Activation & One-Time Password Link</span>
                <span className="text-[10px] text-theme-text-secondary font-normal">(Valid for 7 days)</span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={activationModalData.link || `${typeof window !== 'undefined' ? window.location.origin : ''}/activate?email=${encodeURIComponent(activationModalData.member.email)}`}
                  className="w-full px-3 py-2 bg-theme-background/60 border border-theme-card-border rounded-xl text-xs text-theme-text-primary focus:outline-none font-mono selection:bg-accent selection:text-white"
                />
                <button
                  type="button"
                  onClick={() => {
                    const linkToCopy = activationModalData.link || `${window.location.origin}/activate?email=${encodeURIComponent(activationModalData.member.email)}`;
                    navigator.clipboard.writeText(linkToCopy);
                    setCopiedActivationLink(true);
                    setTimeout(() => setCopiedActivationLink(false), 3000);
                  }}
                  className="px-3.5 py-2 bg-accent hover:bg-primary-light text-white font-semibold rounded-xl text-xs flex items-center gap-1.5 transition-all shrink-0 cursor-pointer shadow-md shadow-accent/20"
                >
                  {copiedActivationLink ? (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      Copy Link
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Resend Welcome Email Button */}
            <div className="pt-1 flex items-center justify-between">
              <button
                type="button"
                onClick={() => handleResendActivation(activationModalData.member)}
                disabled={resendingMemberId === activationModalData.member.id}
                className="text-xs font-semibold text-accent hover:underline flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Mail className="h-3.5 w-3.5" />
                Resend Welcome Email
              </button>
            </div>

            {/* Admin Direct Password Override Section */}
            <div className="border-t border-theme-border/30 pt-4 space-y-3">
              <div className="flex items-center gap-1.5 text-xs font-bold text-theme-text-primary">
                <Lock className="h-3.5 w-3.5 text-warning" />
                <span>Admin Direct Password Override (Optional)</span>
              </div>
              <p className="text-[11px] text-theme-text-secondary leading-snug">
                Alternatively, set a temporary password directly right now so the member can sign in immediately without clicking the email link.
              </p>

              {adminPasswordSuccessMsg && (
                <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl text-xs flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>{adminPasswordSuccessMsg}</span>
                </div>
              )}

              <form onSubmit={handleAdminSetPassword} className="flex items-center gap-2">
                <input
                  type="text"
                  value={adminPasswordInput}
                  onChange={(e) => setAdminPasswordInput(e.target.value)}
                  placeholder="Enter temporary password (min 4 chars)"
                  className="w-full px-3 py-2 bg-theme-background/60 border border-theme-card-border rounded-xl text-xs text-theme-text-primary focus:outline-none focus:border-accent"
                />
                <button
                  type="submit"
                  disabled={isAdminSettingPassword || adminPasswordInput.length < 4}
                  className="px-3.5 py-2 bg-warning hover:bg-warning/90 text-black font-bold rounded-xl text-xs transition-all shrink-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isAdminSettingPassword ? 'Setting...' : 'Set Password'}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
