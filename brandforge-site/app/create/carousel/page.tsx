import { redirect } from 'next/navigation';

// The carousel maker is the Create page now; this keeps the earlier address working.
export default function CarouselRedirect() {
  redirect('/create');
}
