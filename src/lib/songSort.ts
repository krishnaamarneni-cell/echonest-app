import { Song } from '@/types';

export type SortKey =
  | 'date_added_desc'
  | 'date_added_asc'
  | 'title_asc'
  | 'title_desc'
  | 'artist_asc'
  | 'artist_desc'
  | 'duration_asc'
  | 'duration_desc';

export const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'date_added_desc', label: 'Recently added' },
  { key: 'date_added_asc', label: 'Oldest first' },
  { key: 'title_asc', label: 'Title (A→Z)' },
  { key: 'title_desc', label: 'Title (Z→A)' },
  { key: 'artist_asc', label: 'Artist (A→Z)' },
  { key: 'artist_desc', label: 'Artist (Z→A)' },
  { key: 'duration_desc', label: 'Longest first' },
  { key: 'duration_asc', label: 'Shortest first' },
];

export function sortSongs(songs: Song[], key: SortKey): Song[] {
  const arr = songs.slice();
  switch (key) {
    case 'date_added_desc':
      return arr.sort((a, b) => b.created_at.localeCompare(a.created_at));
    case 'date_added_asc':
      return arr.sort((a, b) => a.created_at.localeCompare(b.created_at));
    case 'title_asc':
      return arr.sort((a, b) =>
        (a.title || '').localeCompare(b.title || '', undefined, {
          sensitivity: 'base',
        }),
      );
    case 'title_desc':
      return arr.sort((a, b) =>
        (b.title || '').localeCompare(a.title || '', undefined, {
          sensitivity: 'base',
        }),
      );
    case 'artist_asc':
      return arr.sort((a, b) =>
        (a.artist_name || '').localeCompare(b.artist_name || '', undefined, {
          sensitivity: 'base',
        }),
      );
    case 'artist_desc':
      return arr.sort((a, b) =>
        (b.artist_name || '').localeCompare(a.artist_name || '', undefined, {
          sensitivity: 'base',
        }),
      );
    case 'duration_asc':
      return arr.sort((a, b) => (a.duration || 0) - (b.duration || 0));
    case 'duration_desc':
      return arr.sort((a, b) => (b.duration || 0) - (a.duration || 0));
  }
}
