'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { supabase } from '@/lib/supabase';
import { fetchAuthed, getSessionUser } from '@/lib/browser-auth';
import { getUserRoleFromEmail } from '@/lib/user-roles';
import { avatarTone, initialsFor } from '@/lib/identity-display';
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
  const [theme, setTheme] = useState<Theme>(() => getStoredTheme());
  const [telegramConnected, setTelegramConnected] = useState(false);
  const [telegramCode, setTelegramCode] = useState('');
  const [telegramBotUrl, setTelegramBotUrl] = useState('');
  const [telegramBusy, setTelegramBusy] = useState(false);
  const [telegramCopied, setTelegramCopied] = useState(false);
  const [telegramError, setTelegramError] = useState('');
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [marketingBusy, setMarketingBusy] = useState(false);

  function handleThemeChange(next: Theme) {
    setStoredTheme(next);
    setTheme(next);
  }

  async function handleTelegramConnect() {
    setTelegramBusy(true);
    setTelegramError('');
    try {
      const response = await fetchAuthed('/api/identity/telegram-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || 'Could not start Telegram linking.');
      }
      setTelegramCode(data.code ?? '');
      setTelegramBotUrl(data.botUrl ?? '');
    } catch (cause) {
      setTelegramError(cause instanceof Error ? cause.message : 'Could not start Telegram linking.');
    } finally {
      setTelegramBusy(false);
    }
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
          setTelegramConnected(data?.telegram_connected === true);
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
                    decoding="async"
                    className="h-full w-full rounded-full object-cover"
                  />
                ) : (
                  <span>{initialsFor(profile.name)}</span>
                )}
              </div>
              <div className="min-w-0">
                <p className="truncate text-base text-foreground">{profile.name}</p>
                <p className="truncate text-sm text-muted">{profile.email}</p>
                <p className="mt-0.5 text-[10px] uppercase tracking-[0.15em] text-muted">
                  {profile.role}
                </p>
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
                <div>
                  <label className="text-sm text-muted" htmlFor="settings-avatar">
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
                    className="mt-1 w-full text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-overlay file:px-3 file:py-2 file:text-xs file:text-foreground"
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
                {(['original', 'light'] as Theme[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    role="radio"
                    aria-checked={theme === t}
                    onClick={() => handleThemeChange(t)}
                    className={`rounded-lg border px-3 py-1.5 text-xs transition ${
                      theme === t
                        ? 'border-ember bg-ember/10 text-ember'
                        : 'border-line text-muted hover:border-ember hover:text-foreground'
                    }`}
                  >
                    {t === 'original' ? 'Forge' : 'Light'}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-xs text-muted">
                Forge is the default dark look. Light is brighter, for daytime.
              </p>
            </div>
          </div>
        </div>

        <div className="min-w-0 rounded-2xl border border-line bg-panel p-5">
          <h2 className="text-xl font-medium text-foreground">Notifications</h2>
          <div className="mt-4">
            <p className="text-sm text-muted">Telegram</p>
            {telegramConnected ? (
              <p className="mt-1 text-sm text-foreground">
                Connected — project updates are delivered to your Telegram.
              </p>
            ) : telegramCode ? (
              <div className="mt-2 rounded-lg border border-ember/30 bg-ember/10 px-3 py-2 text-xs">
                <p className="mb-1.5 leading-snug text-muted">
                  Paste this code in the bot to get project updates in Telegram:
                </p>
                <div className="flex items-center gap-2">
                  <code className="select-all font-mono text-sm font-bold tracking-[0.2em] text-foreground">
                    {telegramCode}
                  </code>
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard?.writeText(telegramCode).then(() => {
                        setTelegramCopied(true);
                        setTimeout(() => setTelegramCopied(false), 1500);
                      });
                    }}
                    className="ml-auto rounded border border-ember/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ember transition hover:bg-ember/20"
                  >
                    {telegramCopied ? 'Copied' : 'Copy'}
                  </button>
                </div>
                {telegramBotUrl ? (
                  <a
                    href={telegramBotUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1.5 inline-flex items-center gap-1 font-semibold text-ember underline-offset-2 transition hover:underline"
                  >
                    <span aria-hidden="true">✈</span> Open the bot
                  </a>
                ) : null}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => void handleTelegramConnect()}
                disabled={telegramBusy}
                className="mt-2 flex w-full items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm text-muted transition hover:border-ember hover:text-foreground disabled:opacity-60"
              >
                <span aria-hidden="true">✈</span>
                {telegramBusy ? 'Starting…' : 'Connect Telegram'}
              </button>
            )}
            {telegramError ? (
              <p role="alert" className="mt-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
                {telegramError}
              </p>
            ) : null}
            <p className="mt-2 text-xs text-muted">
              Get pinged the moment a brief, proposal, or delivery needs you.
            </p>
            <div className="mt-5 border-t border-line pt-4">
              <label
                htmlFor="marketing-emails"
                className="flex min-h-9 cursor-pointer items-start gap-3"
              >
                <input
                  id="marketing-emails"
                  type="checkbox"
                  checked={marketingOptIn}
                  disabled={marketingBusy}
                  onChange={(event) => void handleMarketingToggle(event.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-ember"
                />
                <span className="text-sm text-foreground">
                  Email me occasional product updates
                </span>
              </label>
              <p className="mt-1 text-xs text-muted">
                Off means only project email arrives — proposals, contracts, delivery. Every email
                also carries its own unsubscribe link.
              </p>
            </div>
          </div>
        </div>

        <div id="integrations" className="min-w-0 scroll-mt-6 rounded-2xl border border-line bg-panel p-5 lg:col-span-2">
          <h2 className="text-xl font-medium text-foreground">Integrations</h2>
          <p className="mt-1 text-sm text-muted">Channels BrandForge can create for, publish to and learn from.</p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <div className="rounded-xl border border-line px-3 py-2.5">
              <p className="text-sm text-foreground">Telegram</p>
              <p className="text-xs text-muted">{telegramConnected ? 'Connected. Project updates arrive here.' : 'Not linked. Use the code under Notifications.'}</p>
            </div>
            <div className="rounded-xl border border-line px-3 py-2.5">
              <p className="text-sm text-foreground">Discord</p>
              <p className="text-xs text-muted">Team alerts and changelog run through the BrandForge server.</p>
            </div>
          </div>
          <p className="mt-4 text-xs uppercase tracking-[0.15em] text-muted">Coming next</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {['Buffer', 'X', 'LinkedIn', 'Instagram', 'TikTok', 'YouTube', 'Meta Ads', 'Google Ads'].map((name) => (
              <span key={name} className="rounded-full border border-line px-3 py-1 text-xs text-muted">{name}</span>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted">Tell us in Discord which one you need first. It moves up the list.</p>
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
