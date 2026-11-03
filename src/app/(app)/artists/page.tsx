'use client';

import { ChannelBrowser } from '@/components/ui/ChannelBrowser';

export default function ArtistsPage() {
  return (
    <ChannelBrowser
      category="music"
      heading="Artists"
      blurb="Search any artist or music label, add them to your list, and open one for their top songs."
    />
  );
}
