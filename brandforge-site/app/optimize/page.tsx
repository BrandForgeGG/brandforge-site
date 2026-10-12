import { redirect } from 'next/navigation';

// Optimize is gone: its place is Distribute, where the AI writes a week of posts for you.
export default function OptimizePage() {
  redirect('/distribute');
}
