'use client';

import { ChannelBrowser } from '@/components/ui/ChannelBrowser';

export default function NewsPage() {
  return (
    <ChannelBrowser
      category="news"
      heading="News"
      blurb="Search any news channel, add it to your list, and open it for the latest videos."
    />
  );
}
