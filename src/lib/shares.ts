'use client';

/**
 * Sharing a playlist or your Liked Songs with another EchoNest user.
 *
 * There is no copying anywhere here. Sharing inserts a row in
 * collection_shares, which the RLS policies in
 * supabase-migration-shared-collections.sql read to grant the recipient
 * SELECT on the owner's existing rows. So a song the owner adds later is
 * visible to the recipient on their next load, with nothing to sync.
 *
 * The email lookup deliberately lives inside the share_collection RPC
 * rather than in a "find user" endpoint: a profile is only ever returned
 * as the receipt for a share that actually happened, never for an address
 * someone typed to see whether it exists.
 */

import { createClient } from '@/lib/supabase/client';

export type ShareKind = 'playlist' | 'likes';

export interface ShareRow {
  id: string;
  kind: ShareKind;
  playlist_id: string | null;
  owner_id: string;
  shared_with: string;
  can_edit: boolean;
  created_at: string;
}

/** A share plus the profile of whoever is on the other end of it. */
export interface ShareWithPerson extends ShareRow {
  person: {
    id: string;
    email: string | null;
    display_name: string | null;
    username: string | null;
  } | null;
}

/**
 * Postgres raises these from share_collection as exception messages. They
 * arrive on the client wrapped in Supabase's own prose, so match rather
 * than compare, and fall back to the raw text instead of swallowing an
 * error nobody anticipated.
 */
const SHARE_ERRORS: [string, string][] = [
  ['no_such_user', "No EchoNest account uses that email address."],
  ['cannot_share_with_self', "That's your own account."],
  ['not_your_playlist', 'Only the owner can share this playlist.'],
  ['not_signed_in', 'Sign in to share.'],
  ['bad_kind', 'That collection cannot be shared.'],
];

export function describeShareError(message: string | undefined): string {
  if (!message) return 'Could not share. Try again.';
  for (const [code, friendly] of SHARE_ERRORS) {
    if (message.includes(code)) return friendly;
  }
  return message;
}

/**
 * Share with the account that owns `email`. Re-sharing the same
 * collection with the same person updates the existing row rather than
 * stacking duplicates, so this is safe to call twice.
 */
export async function shareCollection(
  kind: ShareKind,
  playlistId: string | null,
  email: string,
  canEdit = true,
): Promise<{ ok: true; name: string } | { ok: false; error: string }> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('share_collection', {
    p_kind: kind,
    p_playlist_id: playlistId,
    p_email: email,
    p_can_edit: canEdit,
  });

  if (error) return { ok: false, error: describeShareError(error.message) };

  const row = Array.isArray(data) ? data[0] : data;
  const name =
    (row?.recipient_name as string) || (row?.recipient_email as string) || email;
  return { ok: true, name };
}

/**
 * Who a collection is currently shared with. Two queries rather than a
 * join: PostgREST can't embed profiles from collection_shares without a
 * declared foreign key between them, and both tables point at auth.users
 * instead of at each other.
 */
export async function listShares(
  kind: ShareKind,
  playlistId: string | null,
): Promise<ShareWithPerson[]> {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return [];

  let q = supabase
    .from('collection_shares')
    .select('*')
    .eq('owner_id', auth.user.id)
    .eq('kind', kind);
  if (kind === 'playlist') q = q.eq('playlist_id', playlistId);

  const { data } = await q.order('created_at', { ascending: false });
  const shares = (data || []) as ShareRow[];
  if (shares.length === 0) return [];

  const { data: people } = await supabase
    .from('profiles')
    .select('id, email, display_name, username')
    .in('id', shares.map((s) => s.shared_with));

  const byId = new Map((people || []).map((p) => [p.id as string, p]));
  return shares.map((s) => ({
    ...s,
    person: (byId.get(s.shared_with) as ShareWithPerson['person']) || null,
  }));
}

/** Stop sharing. Works from either side — the owner revokes, the recipient leaves. */
export async function removeShare(shareId: string): Promise<boolean> {
  const supabase = createClient();
  const { error } = await supabase
    .from('collection_shares')
    .delete()
    .eq('id', shareId);
  return !error;
}

/** Playlists other people have shared with me, for the Library. */
export async function listSharedWithMe(): Promise<
  { share: ShareRow; playlist: Record<string, unknown> | null; ownerName: string }[]
> {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return [];

  const { data } = await supabase
    .from('collection_shares')
    .select('*')
    .eq('shared_with', auth.user.id)
    .order('created_at', { ascending: false });

  const shares = (data || []) as ShareRow[];
  if (shares.length === 0) return [];

  // The playlists these point at are readable thanks to the
  // "Shared playlists are readable" policy, so a plain select works.
  const playlistIds = shares
    .filter((s) => s.kind === 'playlist' && s.playlist_id)
    .map((s) => s.playlist_id as string);

  const [{ data: playlists }, { data: owners }] = await Promise.all([
    playlistIds.length
      ? supabase.from('playlists').select('*').in('id', playlistIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    supabase
      .from('profiles')
      .select('id, email, display_name, username')
      .in('id', shares.map((s) => s.owner_id)),
  ]);

  const playlistById = new Map(
    (playlists || []).map((p) => [p.id as string, p as Record<string, unknown>]),
  );
  const ownerById = new Map(
    (owners || []).map((p) => [
      p.id as string,
      (p.display_name as string) || (p.username as string) || (p.email as string) || 'Someone',
    ]),
  );

  return shares.map((s) => ({
    share: s,
    playlist: s.playlist_id ? playlistById.get(s.playlist_id) || null : null,
    ownerName: ownerById.get(s.owner_id) || 'Someone',
  }));
}
