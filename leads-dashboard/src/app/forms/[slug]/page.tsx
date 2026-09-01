'use client';

import React, { useState, useEffect, use } from 'react';
import { CheckCircle2, ChevronLeft, Send, Sparkles, AlertTriangle, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { getForms, addSubmission, syncWithServer, PublicFormItem } from '@/lib/local-data';
import { TermsModal } from '@/components/terms-modal';
import { GhostFibers } from '@/components/ui/ghost-fibers';

export default function PublicFormPage({ params }: { params: Promise<{ slug: string }> }) {
  const resolvedParams = use(params);
  const slug = resolvedParams.slug;

  const [form, setForm] = useState<PublicFormItem | null>(null);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [honeypot, setHoneypot] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [isTermsOpen, setIsTermsOpen] = useState(false);

  // Public form links are opened standalone (shared via QR code, email, etc.)
  // outside the dashboard's own theme toggle, so they'd otherwise inherit
  // whatever `.dark` state the browser happened to be left in (or none at
  // all) — force the same dynamic dark glassmorphic background the rest of
  // the app uses, since dark is the only theme this page is designed for.
  useEffect(() => {
    document.documentElement.classList.add('dark');
  }, []);

  useEffect(() => {
    let cancelled = false;

    const applyForm = (matchedForm: PublicFormItem | undefined) => {
      if (cancelled) return;
      // A form that's never been approved (still pending, or was rejected)
      // has no live public link yet — treat it exactly like a missing slug
      // rather than exposing an unreviewed form to respondents.
      if (!matchedForm || matchedForm.approvalStatus === 'pending_create' || matchedForm.approvalStatus === 'rejected') {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setForm(matchedForm);
      const initialData: Record<string, any> = {};
      matchedForm.fields.forEach(f => {
        initialData[f.id] = f.type === 'multiselect' ? [] : '';
      });
      setFormData(initialData);
      setLoading(false);
    };

    const localMatch = getForms().find(f => f.slug.toLowerCase() === slug.toLowerCase());
    if (localMatch) {
      // Already cached in this browser (e.g. staff previewing right after
      // building it) — show it immediately, no need to wait on the network.
      applyForm(localMatch);
      return;
    }

    // A real respondent filling this out from a shared link has never logged
    // into the dashboard in this browser, so localStorage starts completely
    // empty — reading it alone would always report "Form Not Found" for a
    // real, live form. Sync with the server first so the actual form list is
    // available before deciding the slug doesn't exist.
    syncWithServer().then(() => {
      if (cancelled) return;
      applyForm(getForms().find(f => f.slug.toLowerCase() === slug.toLowerCase()));
    });

    return () => { cancelled = true; };
  }, [slug]);

  const handleInputChange = (fieldId: string, value: any) => {
    setFormData(prev => ({ ...prev, [fieldId]: value }));
  };

  const handleMultiselectToggle = (fieldId: string, option: string) => {
    setFormData(prev => {
      const current: string[] = Array.isArray(prev[fieldId]) ? prev[fieldId] : [];
      const next = current.includes(option)
        ? current.filter(o => o !== option)
        : [...current, option];
      return { ...prev, [fieldId]: next };
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;

    // Honeypot spam protection: if bot filled hidden field, simulate success but drop
    if (honeypot.trim() !== '') {
      setIsSubmitted(true);
      return;
    }

    addSubmission({
      formId: form.id,
      slug: form.slug,
      data: formData,
    });

    setIsSubmitted(true);
  };

  const backgroundShader = (
    <div className="fixed inset-0 pointer-events-none -z-10 opacity-75 dark:opacity-90 overflow-hidden">
      <GhostFibers
        lineColor="#001f53"
        glowColor="#03d8fc"
        speed={0.2}
        scale={2}
        rotation={-24}
        rotationSpeed={0.25}
        layers={4}
        waveAmplitude={0.015}
        waveFrequency={3}
        waveSpeed={0.15}
        layerSpeed={0.08}
        twist={0.1}
        twistFrequency={5}
        twistSpeed={1.2}
        lineFrequency={5}
        lineSpacing={2}
        lineSharpness={16}
        glowFalloff={10}
        glowIntensity={1.6}
        brightness={2}
        blueBoost={1.25}
        vignette={0.8}
        grain={0.05}
        dpr={1}
      />
    </div>
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-space-theme flex flex-col items-center justify-center p-4 relative z-0 overflow-hidden select-none">
        {backgroundShader}
        <div className="glass-panel rounded-2xl px-6 py-4 flex items-center gap-3 border border-white/15 shadow-2xl backdrop-blur-xl">
          <div className="h-4 w-4 border-2 border-accent border-t-transparent rounded-full animate-spin"></div>
          <span className="text-xs font-semibold text-theme-text-primary">Loading form details...</span>
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-space-theme text-theme-text-primary flex flex-col items-center justify-center p-4 relative z-0 overflow-hidden select-none">
        {backgroundShader}
        <div className="glass-panel w-full max-w-md rounded-3xl p-8 flex flex-col items-center text-center space-y-5 border border-white/20 dark:border-white/15 shadow-2xl backdrop-blur-2xl bg-theme-card/90">
          <div className="h-14 w-14 bg-amber-500/15 rounded-2xl flex items-center justify-center border border-amber-500/30 text-amber-400">
            <AlertTriangle className="h-7 w-7" />
          </div>
          <div className="space-y-1.5">
            <h1 className="text-lg font-bold text-theme-text-primary">Form Not Found</h1>
            <p className="text-xs text-theme-text-secondary leading-relaxed">
              The public form at <code className="text-accent font-mono">/forms/{slug}</code> does not exist, has expired, or the link has changed.
            </p>
          </div>
          <Link
            href="/"
            className="px-4 py-2 bg-accent hover:bg-primary-light text-white text-xs font-semibold rounded-xl transition-all shadow-md shadow-accent/20 cursor-pointer"
          >
            Return to Portal Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-space-theme text-theme-text-primary flex flex-col items-center justify-center p-4 py-12 relative z-0 overflow-hidden select-none">
      {backgroundShader}
      
      {isSubmitted ? (
        // Submission Success View
        <div className="glass-panel w-full max-w-md rounded-3xl p-8 flex flex-col items-center text-center space-y-6 border border-emerald-500/30 shadow-2xl backdrop-blur-2xl bg-theme-card/90 animate-in zoom-in-95 duration-300">
          <div className="h-16 w-16 bg-emerald-500/15 rounded-full flex items-center justify-center border border-emerald-500/30">
            <CheckCircle2 className="h-9 w-9 text-emerald-400" />
          </div>
          
          <div className="space-y-2">
            <h1 className="text-xl font-bold text-theme-text-primary">Response Recorded!</h1>
            <p className="text-xs text-theme-text-secondary leading-relaxed">
              Thank you for your submission. Your details have been securely recorded for <strong className="text-theme-text-primary">{form?.title}</strong>.
            </p>
          </div>

          <div className="border-t border-theme-border/40 pt-4 w-full text-center">
            <Link 
              href="/"
              className="inline-flex items-center gap-1.5 text-xs text-accent hover:underline font-semibold"
            >
              <ChevronLeft className="h-4 w-4" />
              Return to MSRUAS LEADS
            </Link>
          </div>
        </div>
      ) : (
        // Public Form Fill View (Clean light/dark responsive card with GhostFibers background)
        <div className="glass-panel w-full max-w-xl rounded-3xl p-6 md:p-8 flex flex-col space-y-6 relative overflow-hidden border border-white/20 dark:border-white/15 shadow-2xl backdrop-blur-2xl bg-theme-card/90">
          
          {/* Top Banner Accent */}
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[#001f53] via-accent to-[#03d8fc]"></div>

          {/* Form Header */}
          <div className="flex flex-col items-center text-center space-y-2 pt-1">
            <div className="h-11 w-11 bg-accent/15 border border-accent/30 rounded-2xl flex items-center justify-center shadow-lg text-accent">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold text-theme-text-primary tracking-tight leading-tight">{form?.title}</h1>
              <p className="text-xs text-theme-text-secondary mt-1">{form?.description || 'Please complete the requested information below.'}</p>
              {form?.eventName && (
                <p className="text-xs text-accent font-semibold mt-1 flex items-center justify-center gap-1">
                  <span>For event:</span>
                  <span className="underline">{form.eventName}</span>
                </p>
              )}
            </div>
          </div>

          {/* Form Body */}
          <form onSubmit={handleSubmit} className="space-y-4 pt-1 text-xs">
            
            {/* Honeypot field (hidden from human users for spam bot mitigation) */}
            <input
              type="text"
              name="website_url_hp"
              value={honeypot}
              onChange={(e) => setHoneypot(e.target.value)}
              tabIndex={-1}
              autoComplete="off"
              className="hidden"
              aria-hidden="true"
            />

            {form?.fields.map((field) => (
              <div key={field.id} className="space-y-1.5">
                <label className="block font-semibold text-theme-text-primary">
                  {field.label} {field.required && <span className="text-danger">*</span>}
                </label>

                {field.type === 'scale' ? (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2" role="radiogroup" aria-label={field.label}>
                      {[1, 2, 3, 4, 5].map(n => (
                        <label
                          key={n}
                          className={`flex-1 flex items-center justify-center py-3 rounded-xl border cursor-pointer text-sm font-bold transition-all shadow-sm ${
                            Number(formData[field.id]) === n
                              ? 'bg-accent border-accent text-white shadow-accent/30'
                              : 'bg-theme-background/60 border-theme-border/60 text-theme-text-secondary hover:border-accent/60 hover:text-theme-text-primary'
                          }`}
                        >
                          <input
                            type="radio"
                            name={field.id}
                            value={n}
                            required={field.required}
                            checked={Number(formData[field.id]) === n}
                            onChange={() => handleInputChange(field.id, n)}
                            className="sr-only"
                          />
                          {n}
                        </label>
                      ))}
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-theme-text-secondary px-0.5">
                      <span>1 = Low</span>
                      <span>5 = High</span>
                    </div>
                  </div>
                ) : field.type === 'textarea' ? (
                  <textarea
                    required={field.required}
                    value={formData[field.id] || ''}
                    onChange={(e) => handleInputChange(field.id, e.target.value)}
                    rows={3}
                    placeholder="Enter your response..."
                    className="w-full px-4 py-3 bg-theme-background/60 border border-theme-border/60 rounded-xl text-theme-text-primary placeholder:text-theme-text-secondary/60 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all text-xs"
                  />
                ) : field.type === 'select' && field.options ? (
                  <select
                    required={field.required}
                    value={formData[field.id] || ''}
                    onChange={(e) => handleInputChange(field.id, e.target.value)}
                    className="w-full px-4 py-3 bg-theme-background/60 border border-theme-border/60 rounded-xl text-theme-text-primary focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all text-xs"
                  >
                    <option value="">Select an option...</option>
                    {field.options.map(opt => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                ) : field.type === 'checkbox' ? (
                  <label className="flex items-center gap-2.5 cursor-pointer text-theme-text-primary">
                    <input
                      type="checkbox"
                      checked={Boolean(formData[field.id])}
                      onChange={(e) => handleInputChange(field.id, e.target.checked)}
                      className="h-4 w-4 rounded border-theme-border/80 bg-theme-background text-accent focus:ring-accent"
                    />
                    <span className="text-xs font-medium">Yes</span>
                  </label>
                ) : field.type === 'multiselect' && field.options ? (
                  <div className="grid grid-cols-2 gap-2" role="group" aria-label={field.label}>
                    {field.options.map(opt => {
                      const selected: string[] = Array.isArray(formData[field.id]) ? formData[field.id] : [];
                      const checked = selected.includes(opt);
                      return (
                        <label
                          key={opt}
                          className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border cursor-pointer text-xs font-medium transition-all ${
                            checked
                              ? 'bg-accent/20 border-accent text-theme-text-primary shadow-sm'
                              : 'bg-theme-background/60 border-theme-border/60 text-theme-text-secondary hover:border-accent/60'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => handleMultiselectToggle(field.id, opt)}
                            className="h-4 w-4 rounded border-theme-border/80 bg-theme-background text-accent focus:ring-accent"
                          />
                          {opt}
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <input
                    type={field.type === 'email' ? 'email' : field.type === 'number' ? 'number' : 'text'}
                    required={field.required}
                    value={formData[field.id] || ''}
                    onChange={(e) => handleInputChange(field.id, e.target.value)}
                    placeholder={`Enter ${field.label.toLowerCase()}...`}
                    className="w-full px-4 py-3 bg-theme-background/60 border border-theme-border/60 rounded-xl text-theme-text-primary placeholder:text-theme-text-secondary/60 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all text-xs"
                  />
                )}
              </div>
            ))}

            <div className="pt-3">
              <button
                type="submit"
                className="w-full py-3.5 bg-accent hover:bg-accent/90 text-white font-bold rounded-xl transition-all shadow-xl shadow-accent/25 flex items-center justify-center gap-2.5 cursor-pointer text-xs uppercase tracking-wider"
              >
                <Send className="h-4 w-4" />
                Submit Registration
              </button>
            </div>

            <div className="flex items-center justify-center gap-1.5 text-[10px] text-theme-text-secondary pt-2">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
              <span>Encrypted & Verified &bull; LEADS Next Gen MSRUAS</span>
            </div>
          </form>
        </div>
      )}

      {/* Footer Info */}
      <footer className="mt-8 text-center text-[11px] text-theme-text-secondary space-y-1 max-w-lg px-4 pb-6">
        <p>
          By visiting or using this portal, you agree to our{' '}
          <button
            type="button"
            onClick={() => setIsTermsOpen(true)}
            className="font-semibold text-accent underline hover:text-accent/80 transition-colors cursor-pointer"
          >
            Terms & Conditions
          </button>.
        </p>
        <p className="text-[10px]">
          All Intellectual Property, Copyrights & Development Licensing belong exclusively to <strong>Kayomarz Pavri</strong>.
        </p>
        <p className="text-[10px] opacity-75">&copy; 2026 LEADS Next Gen Centre &middot; MSRUAS Internal Operations Portal</p>
      </footer>

      {/* Terms & Conditions Modal */}
      <TermsModal isOpen={isTermsOpen} onClose={() => setIsTermsOpen(false)} />
    </div>
  );
}
