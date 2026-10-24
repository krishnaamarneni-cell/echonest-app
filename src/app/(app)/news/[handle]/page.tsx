'use client';

import { useParams } from 'next/navigation';
import { ChannelEpisodes } from '@/components/ui/ChannelEpisodes';

export default function NewsDetailPage() {
  const { handle } = useParams<{ handle: string }>();
  return <ChannelEpisodes handle={handle} category="news" />;
}
