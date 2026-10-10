'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { supabase } from '@/lib/supabase';
import { fetchAuthed, getSessionUser } from '@/lib/browser-auth';
import { IntegrationsPanel } from '@/components/integrations/integrations-panel';
import { getUserRoleFromEmail } from '@/lib/user-roles';
import { roleLine } from '@/lib/identity-display';
import { AvatarEditor } from '@/components/profile/avatar-editor';
import { SettingsPlanCard } from '@/components/settings-plan-card';
import { getStoredTheme, setStoredTheme, type Theme } from '@/lib/theme';

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

const THEME_CHOICES: { id: Theme; label: string; bg: string; fg: string; accent: string }[] = [
  { id: 'forge', label: 'Forge', bg: '#0f0e0d', fg: '#f1ece4', accent: '#ff6a2b' },
  { id: 'crystal', label: 'Crystal', bg: '#090e13', fg: '#e8f1f8', accent: '#55c7ff' },
  { id: 'mono', label: 'Black and white', bg: '#ffffff', fg: '#0a0a0a', accent: '#0a0a0a' },
];

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
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [theme, setTheme] = useState<Theme>(() => getStoredTheme());
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [marketingBusy, setMarketingBusy] = useState(false);

  function handleThemeChange(next: Theme) {
    setStoredTheme(next);
    setTheme(next);
  }

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
            // profiles.role is the truth; the email hint in base only covers rows that predate it.
            if (identity.role) base.role = identity.role;
          }
          setMarketingOptIn(data?.marketing_opt_in === true);
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

  async function handleMarketingToggle(next: boolean) {
    setMarketingBusy(true);
    setError('');
    setSuccess('');
    try {
      const response = await fetchAuthed('/api/identity', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ marketing_opt_in: next }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not save');
      setMarketingOptIn(next);
      setSuccess(next ? 'Product updates are on.' : 'Product updates are off.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save');
    } finally {
      setMarketingBusy(false);
    }
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
        <p className="text-sm text-muted">Loading your account…</p>
      </AppShell>
    );
  }

  if (!profile) {
    return (
      <AppShell title="Settings" subtitle="Profile, org preferences, and account controls.">
        <p className="text-sm text-muted">
          Sign in to view account settings.{' '}
          <a href="/login" className="text-ember underline-offset-2 hover:underline">
            Go to login
          </a>
        </p>
      </AppShell>
    );
  }

  return (
    <AppShell title="Settings" subtitle="Profile, org preferences, and account controls.">
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="min-w-0 rounded-2xl border border-line bg-panel p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-medium text-foreground">Account</h2>
            {!editing ? (
              <button
                type="button"
                onClick={startEditing}
                className="rounded-lg border border-line px-3 py-1.5 text-xs text-muted transition hover:border-ember hover:text-foreground"
              >
                Edit
              </button>
            ) : (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={cancelEditing}
                  className="rounded-lg border border-line px-3 py-1.5 text-xs text-muted transition hover:border-ember hover:text-foreground"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="rounded-lg bg-ember px-3 py-1.5 text-xs font-semibold text-background transition hover:opacity-95 disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            )}
          </div>

          <div className="mt-4 space-y-4">
            <div>
              <AvatarEditor
                name={profile.name}
                seed={profile.email}
                url={avatarPreview}
                onChange={(url) => {
                  setAvatarPreview(url);
                  setProfile((prev) => (prev ? { ...prev, avatarUrl: url } : prev));
                }}
              />
              <div className="mt-3 min-w-0">
                <p className="truncate text-base text-foreground">{profile.name}</p>
                <p className="truncate text-sm text-muted">{profile.email}</p>
                <p className="mt-0.5 text-xs text-muted">{roleLine(profile.role, profile.username)}</p>
              </div>
            </div>

            {editing ? (
              <>
                <div>
                  <label className="text-sm text-muted" htmlFor="settings-name">
                    Display name
                  </label>
                  <input
                    id="settings-name"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-line bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ember"
                  />
                </div>
                <div>
                  <label className="text-sm text-muted" htmlFor="settings-email">
                    Email
                  </label>
                  <input
                    id="settings-email"
                    type="email"
                    value={formEmail}
                    disabled
                    className="mt-1 w-full cursor-not-allowed rounded-lg border border-line bg-overlay px-3 py-2 text-sm text-muted outline-none"
                  />
                  <p className="mt-1 text-xs text-muted">
                    Your sign-in email comes from Google and cannot be changed here.
                  </p>
                </div>
                <div>
                  <label className="text-sm text-muted" htmlFor="settings-username">
                    Username
                  </label>
                  <input
                    id="settings-username"
                    value={formUsername}
                    onChange={(e) => setFormUsername(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-line bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ember"
                  />
                </div>
                <div>
                  <label className="text-sm text-muted" htmlFor="settings-password">
                    New password
                  </label>
                  <input
                    id="settings-password"
                    type="password"
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                    placeholder="Leave blank to keep current"
                    className="mt-1 w-full rounded-lg border border-line bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ember"
                  />
                </div>
              </>
            ) : (
              <>
                <div>
                  <p className="text-sm text-muted">Name</p>
                  <p className="mt-1 text-base text-foreground">{profile.name}</p>
                </div>
                <div>
                  <p className="text-sm text-muted">Email</p>
                  <p className="mt-1 text-base text-foreground">{profile.email}</p>
                </div>
                <div>
                  <p className="text-sm text-muted">Username</p>
                  <p className="mt-1 text-base text-foreground">
                    {profile.username ? `@${profile.username}` : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted">Role</p>
                  <p className="mt-1 text-base uppercase tracking-[0.15em] text-copper">
                    {profile.role}
                  </p>
                </div>
              </>
            )}
          </div>

          {error ? (
            <p
              role="alert"
              className="mt-4 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"
            >
              {error}
            </p>
          ) : null}
          {success ? (
            <p
              role="status"
              className="mt-4 rounded-lg border border-trust/30 bg-trust/10 px-3 py-2 text-sm text-success"
            >
              {success}
            </p>
          ) : null}
        </div>

        <SettingsPlanCard />

        <div className="min-w-0 rounded-2xl border border-line bg-panel p-5">
          <h2 className="text-xl font-medium text-foreground">Workspace</h2>
          <div className="mt-4 space-y-4">
            <div>
              <p className="text-sm text-muted">Organization</p>
              <p className="mt-1 text-base text-foreground">BrandForge</p>
            </div>
            <div>
              <p className="text-sm text-muted">Default timezone</p>
              <p className="mt-1 text-base text-foreground">
                {Intl.DateTimeFormat().resolvedOptions().timeZone}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted">Theme</p>
              <div className="mt-2 flex gap-2" role="radiogroup" aria-label="Theme">
                {THEME_CHOICES.map((choice) => (
                  <button
                    key={choice.id}
                    type="button"
                    role="radio"
                    aria-checked={theme === choice.id}
                    onClick={() => handleThemeChange(choice.id)}
                    className={`flex w-28 flex-col gap-2 rounded-xl border p-2 text-left text-xs transition ${
                      theme === choice.id ? 'border-ember text-foreground' : 'border-line text-muted hover:border-ember hover:text-foreground'
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className="flex h-12 items-end gap-1 rounded-lg border border-black/10 p-1.5"
                      style={{ background: choice.bg }}
                    >
                      <span className="h-3 w-6 rounded" style={{ background: choice.fg, opacity: 0.85 }} />
                      <span className="h-5 w-3 rounded" style={{ background: choice.accent }} />
                    </span>
                    <span className="font-medium">{choice.label}</span>
                  </button>
                ))}
              </div>
              <p className="mt-1 text-xs text-muted">
                Forge is fire orange, Crystal is crystal blue, Mono is plain black and white.
              </p>
            </div>
          </div>
        </div>

        <div className="min-w-0 rounded-2xl border border-line bg-panel p-5">
          <h2 className="text-xl font-medium text-foreground">Email</h2>
          <p className="mt-1 text-sm text-muted">Project email always arrives: proposals, contracts, delivery. This switch is only for product news.</p>
          <label htmlFor="marketing-emails" className="mt-4 flex min-h-9 cursor-pointer items-start gap-3">
            <input
              id="marketing-emails"
              type="checkbox"
              checked={marketingOptIn}
              disabled={marketingBusy}
              onChange={(event) => void handleMarketingToggle(event.target.checked)}
              className="mt-0.5 h-4 w-4 accent-ember"
            />
            <span className="text-sm text-foreground">Email me occasional product updates</span>
          </label>
          <p className="mt-1 text-xs text-muted">Every email also carries its own unsubscribe link.</p>
        </div>

        <div id="integrations" className="min-w-0 scroll-mt-6 rounded-2xl border border-line bg-panel p-5 lg:col-span-2">
          <h2 className="text-xl font-medium text-foreground">Integrations</h2>
          <p className="mt-1 text-sm text-muted">Where BrandForge can reach you and post for you. Connected services light up in their own colour.</p>
          <div className="mt-4">
            <IntegrationsPanel />
          </div>
        </div>

        <div className="lg:col-span-2">
          <button
            type="button"
            onClick={handleSignOut}
            className="rounded-xl border border-line bg-panel px-4 py-2 text-sm font-medium text-foreground transition hover:border-ember"
          >
            Sign out
          </button>
        </div>
      </div>
    </AppShell>
  );
}
