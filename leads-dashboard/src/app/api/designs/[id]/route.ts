import { NextResponse } from 'next/server';
import { mutateCollection } from '@/lib/server-db';
import { deleteStoredFile, deleteStoredFilesForRecord, saveBase64File } from '@/lib/file-storage';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    // A replaced file arrives the same way a brand-new submission's does —
    // a base64 data URL — so it needs the same on-disk treatment POST gives
    // it, not a blind merge that would poison designs.json with raw bytes.
    let previousStorageKey: string | undefined;
    if (typeof body.fileData === 'string' && body.fileData.startsWith('data:')) {
      const stored = await saveBase64File('designs', id, 0, body.fileName || 'file', body.fileData);
      body.fileUrl = stored.url;
      body.storageKey = stored.storageKey;
      body.fileSize = stored.size;
      delete body.fileData;
    }

    // Upsert: if this id isn't in the server's collection yet (e.g. client-bundled
    // sample/seed data never POSTed), create it instead of silently dropping the
    // edit — same fix already applied to every other collection's [id] route.
    const updated = await mutateCollection('designs', (current) => {
      const idx = current.findIndex((d: any) => d.id === id);
      if (idx === -1) return [...current, { id, ...body }];
      const next = [...current];
      if (body.storageKey && next[idx].storageKey && next[idx].storageKey !== body.storageKey) {
        previousStorageKey = next[idx].storageKey;
      }
      next[idx] = { ...next[idx], ...body };
      return next;
    });

    // Best-effort cleanup of the file just replaced, so old assets don't
    // accumulate on disk under a different filename than the new one.
    if (previousStorageKey) {
      await deleteStoredFile(previousStorageKey);
    }

    const target = updated.find((d: any) => d.id === id);
    return NextResponse.json(target);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const updated = await mutateCollection('designs', (current) =>
      current.filter((d: any) => d.id !== id)
    );
    await deleteStoredFilesForRecord('designs', id);
    return NextResponse.json({ success: true, count: updated.length });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
