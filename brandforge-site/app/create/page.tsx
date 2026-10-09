import { AppShell } from '@/components/app-shell';
import { CreateHub } from '@/components/carousel/create-hub';

export const metadata = {
  title: 'Create — BrandForge',
  description: 'Make swipeable carousels for Instagram, TikTok and LinkedIn from a sentence, a web page or a file. Free to make; sign in to edit and download. Videos are in development.',
};

export default function CreatePage() {
  return (
    <AppShell title="Create" subtitle="Pick what to make. Free to start." wide>
      <CreateHub />
    </AppShell>
  );
}
