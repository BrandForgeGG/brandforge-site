'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { supabase } from '@/lib/supabase';
import { fetchAuthed, getSessionUser } from '@/lib/browser-auth';
import { getUserRoleFromEmail } from '@/lib/user-roles';
import { avatarTone, initialsFor } from '@/lib/identity-display';

type SettingsProfile = {
  name: string;
  email: string;
  username: string;
  role: string;
  avatarUrl: string | null;
};

function profileFromEmail(email: string, name?: string | null): SettingsProfile {
  const localPart = email.split('@')[0] || 'Account';
  return {
    name: (name?.trim() || localPart) as string,
    email,
    username: '',
    role: getUserRoleFromEmail(email),
    avatarUrl: null,
  };
}

export default function SettingsPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<SettingsProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formUsername, setFormUsername] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      let sessionUser = await getSessionUser();
      if (!sessionUser?.email) {
        await new Promise((resolve) => setTimeout(resolve, 150));
        sessionUser = await getSessionUser();
      }

      if (!sessionUser?.email) {
        if (!cancelled) setLoading(false);
        return;
      }

      const base = profileFromEmail(
        sessionUser.email,
        sessionUser.user_metadata?.full_name ?? sessionUser.user_metadata?.name,
      );

      try {
        const response = await fetchAuthed('/api/identity');
        if (response.ok) {
          const data = await response.json();
          const identity = data?.identity;
          if (identity) {
            base.username = identity.username ?? '';
            base.avatarUrl = identity.avatarUrl ?? null;
            if (identity.displayName) base.name = identity.displayName;
          }
        }
      } catch {
        // Profile nicety only.
      }

      if (!cancelled) {
        setProfile(base);
        setFormName(base.name);
        setFormEmail(base.email);
        setFormUsername(base.username);
        setAvatarPreview(base.avatarUrl);
        setLoading(false);
      }
    }

    void loadProfile();
    return () => {
      cancelled = true;
    };
  }, [router]);

  function startEditing() {
    if (!profile) return;
    setFormName(profile.name);
    setFormEmail(profile.email);
    setFormUsername(profile.username);
    setFormPassword('');
    setAvatarFile(null);
    setAvatarPreview(profile.avatarUrl);
    setError('');
    setSuccess('');
    setEditing(true);
  }

  function cancelEditing() {
    setEditing(false);
    setError('');
    setSuccess('');
  }

  async function handleSave() {
    if (!profile) return;
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const updates: Record<string, unknown> = {};

      if (formName !== profile.name) updates.display_name = formName;
      if (formEmail !== profile.email) updates.email = formEmail;
      if (formUsername !== profile.username) updates.username = formUsername;

      if (Object.keys(updates).length > 0) {
        const response = await fetchAuthed('/api/identity', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates),
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'Could not save changes');
        }
      }

      if (formPassword) {
        const { error: pwdError } = await supabase.auth.updateUser({
          password: formPassword,
        });
        if (pwdError) throw new Error(pwdError.message);
      }

      if (avatarFile) {
        const ext = avatarFile.name.split('.').pop() || 'png';
        const path = `avatars/${profile.email}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from('avatars')
          .upload(path, avatarFile, { upsert: true });
        if (uploadError) throw new Error(uploadError.message);

        const {
          data: { publicUrl },
        } = supabase.storage.from('avatars').getPublicUrl(path);

        const response = await fetchAuthed('/api/identity', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ avatar_url: publicUrl }),
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'Could not save avatar');
        }
      }

      setProfile((prev) =>
        prev
          ? {
              ...prev,
              name: formName,
              email: formEmail,
              username: formUsername,
              avatarUrl: avatarPreview,
            }
          : prev,
      );
      setEditing(false);
      setSuccess('Changes saved.');
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Could not save changes',
      );
    } finally {
      setSaving(false);
    }
  }

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
    <AppShell title="Settings" subtitle="Profile, org preferences, and account controls.">
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-[#1c2024] p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-medium text-[#ece7de]">Account</h2>
            {!editing ? (
              <button
                type="button"
                onClick={startEditing}
                className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-[#9aa0a6] transition hover:border-[#e8571e] hover:text-[#ece7de]"
              >
                Edit
              </button>
            ) : (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={cancelEditing}
                  className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-[#9aa0a6] transition hover:border-[#e8571e] hover:text-[#ece7de]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="rounded-lg bg-[#e8571e] px-3 py-1.5 text-xs font-semibold text-[#14171a] transition hover:opacity-95 disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            )}
          </div>

          <div className="mt-4 space-y-4">
            <div className="flex items-center gap-4">
              <div
                className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-xl font-semibold"
                style={avatarTone(profile.email)}
              >
                {avatarPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={avatarPreview}
                    alt=""
                    className="h-full w-full rounded-full object-cover"
                  />
                ) : (
                  <span>{initialsFor(profile.name)}</span>
                )}
              </div>
              <div className="min-w-0">
                <p className="truncate text-base text-[#ece7de]">{profile.name}</p>
                <p className="truncate text-sm text-[#9aa0a6]">{profile.email}</p>
                <p className="mt-0.5 text-[10px] uppercase tracking-[0.15em] text-[#8f959b]">
                  {profile.role}
                </p>
              </div>
            </div>

            {editing ? (
              <>
                <div>
                  <label className="text-sm text-[#9aa0a6]" htmlFor="settings-name">
                    Display name
                  </label>
                  <input
                    id="settings-name"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-white/10 bg-[#14171a] px-3 py-2 text-sm text-[#ece7de] outline-none focus:border-[#e8571e]"
                  />
                </div>
                <div>
                  <label className="text-sm text-[#9aa0a6]" htmlFor="settings-email">
                    Email
                  </label>
                  <input
                    id="settings-email"
                    type="email"
                    value={formEmail}
                    disabled
                    className="mt-1 w-full cursor-not-allowed rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-[#9aa0a6] outline-none"
                  />
                  <p className="mt-1 text-xs text-[#8f959b]">
                    Your sign-in email comes from Google and cannot be changed here.
                  </p>
                </div>
                <div>
                  <label className="text-sm text-[#9aa0a6]" htmlFor="settings-username">
                    Username
                  </label>
                  <input
                    id="settings-username"
                    value={formUsername}
                    onChange={(e) => setFormUsername(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-white/10 bg-[#14171a] px-3 py-2 text-sm text-[#ece7de] outline-none focus:border-[#e8571e]"
                  />
                </div>
                <div>
                  <label className="text-sm text-[#9aa0a6]" htmlFor="settings-password">
                    New password
                  </label>
                  <input
                    id="settings-password"
                    type="password"
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                    placeholder="Leave blank to keep current"
                    className="mt-1 w-full rounded-lg border border-white/10 bg-[#14171a] px-3 py-2 text-sm text-[#ece7de] outline-none focus:border-[#e8571e]"
                  />
                </div>
                <div>
                  <label className="text-sm text-[#9aa0a6]" htmlFor="settings-avatar">
                    Profile picture
                  </label>
                  <input
                    id="settings-avatar"
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0] ?? null;
                      setAvatarFile(file);
                      if (file) {
                        const reader = new FileReader();
                        reader.onload = () => setAvatarPreview(reader.result as string);
                        reader.readAsDataURL(file);
                      }
                    }}
                    className="mt-1 w-full text-sm text-[#9aa0a6] file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-2 file:text-xs file:text-[#ece7de]"
                  />
                </div>
              </>
            ) : (
              <>
                <div>
                  <p className="text-sm text-[#9aa0a6]">Name</p>
                  <p className="mt-1 text-base text-[#ece7de]">{profile.name}</p>
                </div>
                <div>
                  <p className="text-sm text-[#9aa0a6]">Email</p>
                  <p className="mt-1 text-base text-[#ece7de]">{profile.email}</p>
                </div>
                <div>
                  <p className="text-sm text-[#9aa0a6]">Username</p>
                  <p className="mt-1 text-base text-[#ece7de]">
                    {profile.username ? `@${profile.username}` : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-[#9aa0a6]">Role</p>
                  <p className="mt-1 text-base uppercase tracking-[0.15em] text-[#b8763b]">
                    {profile.role}
                  </p>
                </div>
              </>
            )}
          </div>

          {error ? (
            <p
              role="alert"
              className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200"
            >
              {error}
            </p>
          ) : null}
          {success ? (
            <p
              role="status"
              className="mt-4 rounded-lg border border-[#5aa578]/30 bg-[#5aa578]/10 px-3 py-2 text-sm text-[#b9e3c4]"
            >
              {success}
            </p>
          ) : null}
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#1c2024] p-5">
          <h2 className="text-xl font-medium text-[#ece7de]">Workspace</h2>
          <div className="mt-4 space-y-4">
            <div>
              <p className="text-sm text-[#9aa0a6]">Organization</p>
              <p className="mt-1 text-base text-[#ece7de]">BrandForge</p>
            </div>
            <div>
              <p className="text-sm text-[#9aa0a6]">Default timezone</p>
              <p className="mt-1 text-base text-[#ece7de]">
                {Intl.DateTimeFormat().resolvedOptions().timeZone}
              </p>
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
