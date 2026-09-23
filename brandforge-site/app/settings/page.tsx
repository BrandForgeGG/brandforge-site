'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { supabase } from '@/lib/supabase';
import { getSessionUser } from '@/lib/browser-auth';
import { getUserRoleFromEmail } from '@/lib/user-roles';

type SettingsProfile = {
  name: string;
  email: string;
  organization: string;
  timezone: string;
  role: string;
};

function profileFromEmail(email: string, name?: string | null): SettingsProfile {
  const localPart = email.split('@')[0] || 'Account';
  return {
    name: (name?.trim() || localPart) as string,
    email,
    organization: 'BrandForge',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    role: getUserRoleFromEmail(email),
  };
}

export default function SettingsPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<SettingsProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      let sessionUser = await getSessionUser();
      if (!sessionUser?.email) {
        await new Promise((resolve) => setTimeout(resolve, 150));
        sessionUser = await getSessionUser();
      }

      if (!sessionUser?.email) {
        if (!cancelled) {
          setLoading(false);
        }
        return;
      }

        if (!cancelled) {
          setProfile(
            profileFromEmail(
              sessionUser.email,
              sessionUser.user_metadata?.full_name ?? sessionUser.user_metadata?.name
            )
          );
          setLoading(false);
        }
      }

    void loadProfile();
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  if (loading) {
    return (
      <AppShell title="Settings" subtitle="Profile, org preferences, and account controls.">
        <p className="text-sm text-[#9aa0a6]">Loading your account…</p>
      </AppShell>
    );
  }

  if (!profile) {
    return (
      <AppShell title="Settings" subtitle="Profile, org preferences, and account controls.">
        <p className="text-sm text-[#9aa0a6]">
          Sign in to view account settings.{' '}
          <a href="/login" className="text-[#e8571e] underline-offset-2 hover:underline">
            Go to login
          </a>
        </p>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Settings"
      subtitle="Profile, org preferences, and account controls."
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-[#1c2024] p-5">
          <h2 className="text-xl font-medium text-[#ece7de]">Account</h2>
          <div className="mt-4 space-y-4">
            <div>
              <p className="text-sm text-[#9aa0a6]">Name</p>
              <p className="mt-1 text-base text-[#ece7de]">{profile.name}</p>
            </div>
            <div>
              <p className="text-sm text-[#9aa0a6]">Email</p>
              <p className="mt-1 text-base text-[#ece7de]">{profile.email}</p>
            </div>
            <div>
              <p className="text-sm text-[#9aa0a6]">Role</p>
              <p className="mt-1 text-base uppercase tracking-[0.15em] text-[#b8763b]">{profile.role}</p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#1c2024] p-5">
          <h2 className="text-xl font-medium text-[#ece7de]">Workspace</h2>
          <div className="mt-4 space-y-4">
            <div>
              <p className="text-sm text-[#9aa0a6]">Organization</p>
              <p className="mt-1 text-base text-[#ece7de]">{profile.organization}</p>
            </div>
            <div>
              <p className="text-sm text-[#9aa0a6]">Default timezone</p>
              <p className="mt-1 text-base text-[#ece7de]">{profile.timezone}</p>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2">
          <button
            type="button"
            onClick={handleSignOut}
            className="rounded-xl border border-white/10 bg-[#1c2024] px-4 py-2 text-sm font-medium text-[#ece7de] transition hover:border-[#e8571e]"
          >
            Sign out
          </button>
        </div>
      </div>
    </AppShell>
  );
}
