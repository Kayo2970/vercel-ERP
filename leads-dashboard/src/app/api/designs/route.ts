import { NextResponse } from 'next/server';
import { readCollection, mutateCollection } from '@/lib/server-db';
import { saveBase64File } from '@/lib/file-storage';

export const maxDuration = 60; // 60s execution limit for large uploads (up to 25 MB)

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB

export async function GET() {
  const items = await readCollection('designs');
  return NextResponse.json(items);
}

export async function POST(request: Request) {
  try {
    const item = await request.json();

    if (!item.title || !item.fileName || !item.fileSize) {
      return NextResponse.json({ error: 'Title, file name, and file size are required.' }, { status: 400 });
    }

    if (item.fileSize > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { error: 'File size exceeds the maximum limit of 25 MB.' },
        { status: 400 }
      );
    }

    const now = new Date();
    const submittedAt = item.submittedAt || now.toISOString();
    const expiresAt = item.expiresAt || new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const id = item.id || 'des_' + Date.now();

    const newDesign = {
      ...item,
      id,
      submittedAt,
      expiresAt,
      isExpired: false,
    };

    // Persist the uploaded asset as a real file on disk under data/uploads/ instead
    // of keeping its full base64 payload inline in designs.json.
    if (typeof newDesign.fileData === 'string' && newDesign.fileData.startsWith('data:')) {
      const stored = await saveBase64File('designs', id, 0, newDesign.fileName, newDesign.fileData);
      newDesign.fileUrl = stored.url;
      newDesign.storageKey = stored.storageKey;
      delete newDesign.fileData;
    }

    const updated = await mutateCollection('designs', (current) => {
      const idx = current.findIndex((d: any) => d.id === newDesign.id);
      if (idx >= 0) {
        current[idx] = newDesign;
        return [...current];
      }
      return [newDesign, ...current];
    });

    const created = updated.find((d: any) => d.id === newDesign.id);

    // Proofread Request Email Dispatch for Professors / Reviewers
    if (created && (created.requestProofread || created.assignedProofreaderId)) {
      try {
        const members = await readCollection('members');
        let proofreader = members.find((m: any) => m.id === created.assignedProofreaderId);
        if (!proofreader && created.assignedProofreaderName) {
          proofreader = members.find((m: any) => m.name.toLowerCase() === created.assignedProofreaderName.toLowerCase());
        }

        if (proofreader && proofreader.email) {
          const { dispatchEmail, wrapInMasterEmailTemplate } = await import('@/lib/email-service');
          const { getAppBaseUrl } = await import('@/lib/app-url');
          const baseUrl = getAppBaseUrl(request);
          const designLink = `${baseUrl}/dashboard/designs?highlight=${created.id}`;
          const subject = `Proofread Request: ${created.title}`;
          const bodyText = `Dear ${proofreader.name},\n\nYou have been requested to proofread a design asset: "${created.title}".\n\nCategory: ${created.category || 'Design Asset'}\nEvent: ${created.eventTitle || 'LEADS Event'}\nSubmitted By: ${created.designerName || 'Designer'} (${created.designerEmail || 'N/A'})\n\nPlease inspect and complete your proofread review here:\n${designLink}\n\nRegards,\nLEADS Design Portal`;

          const bodyHtml = wrapInMasterEmailTemplate({
            pageTitle: subject,
            badgeText: 'PROOFREAD REQUEST',
            badgeColor: '#6366f1',
            headerTitle: 'Proofread Request Received',
            bodyContentHtml: `
            <p style="margin: 0 0 16px; font-size: 14px; color: #475569; line-height: 1.6;">
              Dear <strong>${proofreader.name}</strong>,<br/>
              You have been selected as the proofreader for a new design asset submission.
            </p>

            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; margin-bottom: 20px;">
              <strong style="color: #6366f1; font-size: 15px;">🎨 ${created.title}</strong>
              <div style="font-size: 12px; color: #64748b; margin-top: 8px; line-height: 1.5;">
                <span><strong>Category:</strong> ${created.category || 'Poster'}</span><br/>
                <span><strong>Event:</strong> ${created.eventTitle || 'LEADS Operations'}</span><br/>
                <span><strong>Designer:</strong> ${created.designerName} (${created.designerEmail})</span>
              </div>
            </div>

            <div style="text-align: center; margin: 24px 0 12px;">
              <a href="${designLink}" target="_blank" style="display: inline-block; background: #6366f1; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 12px; font-weight: 600; font-size: 14px;">
                🔍 Inspect & Proofread Design
              </a>
            </div>
            `,
          });

          await dispatchEmail({
            to: proofreader.email,
            subject,
            bodyText,
            bodyHtml,
            category: 'SYSTEM',
          });
        }
      } catch (emailErr) {
        console.error('[designs-api] Proofread email dispatch failed:', emailErr);
      }
    }

    return NextResponse.json(created, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
