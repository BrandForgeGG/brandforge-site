import { redirect } from 'next/navigation';

// Create and Distribute are one page now: make it, then publish it, in the same place.
export default function DistributePage() {
  redirect('/create');
}
