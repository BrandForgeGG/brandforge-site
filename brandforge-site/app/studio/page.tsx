import { redirect } from 'next/navigation';

// AI Studio's placeholder generator is gone: Create and Distribute now open real chats.
export default function StudioPage() {
  redirect('/create');
}
