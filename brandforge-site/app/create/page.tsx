import { AppShell } from '@/components/app-shell';
import { CreateHub } from '@/components/carousel/create-hub';

export const metadata = {
  title: 'Create — BrandForge',
  description: 'Make swipeable carousels for Instagram, TikTok and LinkedIn from a sentence, with a cover picture made from your topic. Free to make; sign in to edit and download.',
};

export default function CreatePage() {
  return (
    <AppShell title="Create" subtitle="Pick what to make. Free to start." wide>
      <CreateHub />
    </AppShell>
  );
}
