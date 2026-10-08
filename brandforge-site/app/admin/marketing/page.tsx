import { redirect } from 'next/navigation';

// The dashboard shows everything on one page.
export default function Page() {
  redirect('/admin');
}
