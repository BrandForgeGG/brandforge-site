import { AppShell } from '@/components/app-shell';
import { CarouselMaker } from '@/components/carousel/carousel-maker';

export const metadata = {
  title: 'Carousel maker — BrandForge',
  description: 'Turn an idea, a web page or a text file into a swipeable carousel for Instagram, TikTok and LinkedIn. Free to make; sign in to edit and download.',
};

export default function CreatePage() {
  return (
    <AppShell title="Carousel maker" subtitle="A hook, one slide per point, a call to action. Free to make." wide>
      <CarouselMaker />
    </AppShell>
  );
}
