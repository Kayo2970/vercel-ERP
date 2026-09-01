import { NextResponse } from 'next/server';
import { mutateCollection } from '@/lib/server-db';
import { deleteStoredFile, saveBase64File } from '@/lib/file-storage';

const MAX_AVATAR_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const updates = await request.json();

    // Persist a newly uploaded profile photo as a real file on disk under
    // data/uploads/, same as guests' visiting cards and design submissions —
    // never keep the raw base64 payload inline in members.json.
    if (typeof updates.avatarData === 'string' && updates.avatarData.startsWith('data:')) {
      const approxSize = Math.ceil((updates.avatarData.length * 3) / 4);
      if (approxSize > MAX_AVATAR_SIZE_BYTES) {
        return NextResponse.json({ error: 'Profile photo exceeds the 2 MB maximum limit.' }, { status: 400 });
      }
      const stored = await saveBase64File('members', id, 0, updates.avatarFileName || 'avatar.jpg', updates.avatarData);
      updates.avatarUrl = stored.url;
      updates.avatarStorageKey = stored.storageKey;
    }
    delete updates.avatarData;
    delete updates.avatarFileName;

    let previousStorageKey: string | undefined;
    // Upsert: if this id isn't in the server's collection yet (e.g. client-bundled
    // sample/seed data never POSTed), create it instead of 404ing and silently
    // dropping the edit.
    const updated = await mutateCollection('members', (current) => {
      const idx = current.findIndex((m: any) => m.id === id);
      if (idx === -1) {
        const isSuper = id === 'm1' || updates.tier === 1 || updates.role === 'Super User';
        if (isSuper) {
          updates.role = 'Super User';
          updates.tier = 1;
          updates.status = 'Active';
        }
        return [...current, { id, ...updates }];
      }
      const next = [...current];
      const isSuper = id === 'm1' || next[idx].tier === 1 || next[idx].role === 'Super User';
      if (updates.avatarStorageKey && next[idx].avatarStorageKey && next[idx].avatarStorageKey !== updates.avatarStorageKey) {
        previousStorageKey = next[idx].avatarStorageKey;
      }
      next[idx] = { ...next[idx], ...updates };
      // Security Fail-Safe: Super User ALWAYS retains Super User role, tier 1, and Active status
      if (isSuper) {
        next[idx].role = 'Super User';
        next[idx].tier = 1;
        next[idx].status = 'Active';
      }
      return next;
    });

    if (previousStorageKey) {
      await deleteStoredFile(previousStorageKey);
    }

    return NextResponse.json(updated.find((m: any) => m.id === id));
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    // `force=true` lifts the Super User protection below — the client only
    // ever sets this after its own isKayomarzPavri() identity check (see
    // local-data.ts's deleteMember), same client-trust model every other
    // admin action in this app already uses; there's no server-side session
    // to re-verify the caller's identity against.
    const force = new URL(request.url).searchParams.get('force') === 'true';
    if (id === 'm1' && !force) {
      return NextResponse.json({ error: 'The Super User account is protected and cannot be deleted.' }, { status: 403 });
    }
    let found = false;
    await mutateCollection('members', (current) => {
      const target = current.find((m: any) => m.id === id);
      if (target && (target.tier === 1 || target.role === 'Super User') && !force) {
        return current;
      }
      const filtered = current.filter((m: any) => m.id !== id);
      found = filtered.length < current.length;
      return filtered;
    });
    if (!found) return NextResponse.json({ error: 'Not found or protected' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
