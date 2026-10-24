'use client';

import { ChannelBrowser } from '@/components/ui/ChannelBrowser';

export default function PodcastsPage() {
  return (
    <ChannelBrowser
      category="podcast"
      heading="Podcasts"
      blurb="Search any show, add it to your list, and open it for the latest episodes."
    />
  );
}
