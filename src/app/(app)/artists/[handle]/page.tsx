'use client';

/**
 * One artist's channel, by YouTube handle.
 *
 * Distinct from /artist/[id], which is an artist row in your own library
 * built from uploads and pulled songs. This one is live: it reads the
 * channel's uploads every visit, so a release that came out this morning is
 * there without anything being imported first.
 */

import { useParams } from 'next/navigation';
import { ChannelEpisodes } from '@/components/ui/ChannelEpisodes';

export default function ArtistChannelPage() {
  const { handle } = useParams<{ handle: string }>();
  return <ChannelEpisodes handle={handle} category="music" />;
}
