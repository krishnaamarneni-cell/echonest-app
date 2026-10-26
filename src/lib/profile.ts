'use client';

/**
 * Usernames and public profiles.
 *
 * A profile is private until its owner claims a username AND flips the
 * public switch. Both are required: public without a username would mean
 * being exposed with no way to be found, which is the worst of both.
 *
 * Reads here are plain selects rather than RPCs. The policies added in
 * supabase-migration-shared-collections.sql already restrict profiles,
 * playlists, likes and songs to rows whose owner opted in, so asking for
 * a private user's playlists returns an empty list rather than an error —
 * the database is the gate, not this file.
 */

import { createClient } from '@/lib/supabase/client';
import { Song } from '@/types';

export interface PublicProfile {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  is_public?: boolean;
}

export const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;

/** Mirrors the check constraint, so the user is told before a round trip. */
export function validateUsername(raw: string): string | null {
  const v = raw.trim().toLowerCase();
  if (v.length < 3) return 'At least 3 characters.';
  if (v.length > 20) return 'At most 20 characters.';
  if (!USERNAME_PATTERN.test(v)) return 'Letters, numbers and underscore only.';
  return null;
}

const USERNAME_ERRORS: [string, string][] = [
  ['username_taken', 'That username is already taken.'],
  ['bad_username', '3–20 characters: letters, numbers and underscore only.'],
  ['not_signed_in', 'Sign in first.'],
];

export async function claimUsername(
  username: string,
): Promise<{ ok: true; username: string } | { ok: false; error: string }> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('set_username', {
    p_username: username,
  });
  if (error) {
    for (const [code, friendly] of USERNAME_ERRORS) {
      if (error.message.includes(code)) return { ok: false, error: friendly };
    }
    return { ok: false, error: error.message };
  }
  return { ok: true, username: String(data) };
}

/** My own profile row, including the fields nobody else can see. */
export async function getMyProfile(): Promise<PublicProfile | null> {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url, is_public')
    .eq('id', auth.user.id)
    .maybeSingle();
  return (data as PublicProfile) || null;
}

export async function setProfilePublic(isPublic: boolean): Promise<boolean> {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return false;
  const { error } = await supabase
    .from('profiles')
    .update({ is_public: isPublic })
    .eq('id', auth.user.id);
  return !error;
}

/** Prefix search. The RPC only ever returns profiles that opted in. */
export async function searchPeople(query: string): Promise<PublicProfile[]> {
  const q = query.trim();
  if (!q) return [];
  const supabase = createClient();
  const { data, error } = await supabase.rpc('search_profiles', { p_query: q });
  if (error) return [];
  return (data || []) as PublicProfile[];
}

/**
 * Everything a profile page shows. Returns null when the username is
 * unknown OR belongs to someone private — deliberately the same answer,
 * so this can't be used to probe who exists.
 */
export async function getPublicProfile(username: string): Promise<{
  profile: PublicProfile;
  playlists: { id: string; title: string; cover_url: string | null; description: string | null }[];
  liked: Song[];
} | null> {
  const supabase = createClient();
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url')
    .eq('username', username.trim().toLowerCase())
    .maybeSingle();

  if (!profile) return null;

  const [{ data: playlists }, { data: likes }] = await Promise.all([
    supabase
      .from('playlists')
      .select('id, title, cover_url, description')
      .eq('user_id', profile.id)
      .order('updated_at', { ascending: false }),
    supabase
      .from('likes')
      .select('song:songs(*)')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(100),
  ]);

  // PostgREST types an embedded row as object-or-array depending on how it
  // infers the relationship, so normalise rather than trusting one shape.
  const liked = ((likes || []) as { song: Song | Song[] | null }[])
    .map((r) => (Array.isArray(r.song) ? r.song[0] : r.song))
    .filter((s): s is Song => !!s);

  return {
    profile: profile as PublicProfile,
    playlists: (playlists || []) as {
      id: string;
      title: string;
      cover_url: string | null;
      description: string | null;
    }[],
    liked,
  };
}
