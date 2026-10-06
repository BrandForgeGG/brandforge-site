'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { BetaBanner } from '@/components/beta-banner';

type StudioView = 'home' | 'create' | 'launch';

const CREATE_TYPES = [
  { id: 'content', label: 'Content', description: 'Blog posts, social copy, articles' },
  { id: 'ads', label: 'Ads', description: 'Ad copy and creative variants' },
  { id: 'email', label: 'Email', description: 'Campaigns, newsletters, sequences' },
  { id: 'landing', label: 'Landing Page', description: 'Conversion-focused pages' },
  { id: 'campaign', label: 'Campaign', description: 'Multi-channel launch campaigns' },
  { id: 'other', label: 'Other', description: 'Something else entirely' },
];

const LAUNCH_PLATFORMS = [
  { id: 'discord', label: 'Discord', description: 'Post to your community channels' },
  { id: 'telegram', label: 'Telegram', description: 'Send to groups or channels' },
  { id: 'twitter', label: 'X / Twitter', description: 'Post to your timeline' },
  { id: 'linkedin', label: 'LinkedIn', description: 'Share with your network' },
];

export default function StudioPage() {
  const router = useRouter();
  const [view, setView] = useState<StudioView>('home');
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [selectedPlatform, setSelectedPlatform] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedOutput, setGeneratedOutput] = useState<string | null>(null);

  function handleCreate() {
    if (!selectedType || !prompt.trim()) return;
    setIsGenerating(true);
    setTimeout(() => {
      setGeneratedOutput(`Generated ${CREATE_TYPES.find((t) => t.id === selectedType)?.label?.toLowerCase() || 'output'} based on your project context:\n\n"${prompt.trim()}"\n\nThis is a placeholder for the actual AI generation. In production, this would call the AI service with your project blueprint as context.`);
      setIsGenerating(false);
    }, 1500);
  }

  function handleLaunch() {
    if (!selectedPlatform) return;
    router.push('/chat');
  }

  return (
    <div className="bf-page">
      <BetaBanner />
      <main className="mx-auto max-w-3xl px-6 py-16">
        {view === 'home' && (
          <div className="space-y-8">
            <div>
              <h1 className="font-serif text-3xl text-foreground">AI Studio</h1>
              <p className="mt-2 text-muted">Create and launch. Everything else is contextual.</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setView('create')}
                className="bf-card group p-6 text-left transition hover:border-ember/50"
              >
                <p className="text-xs uppercase tracking-[0.2em] text-copper">Create</p>
                <p className="mt-2 font-serif text-xl text-foreground group-hover:text-ember">
                  Turn what you have into something usable
                </p>
                <p className="mt-2 text-sm text-muted">
                  Content, ads, email, landing pages, campaigns — generated from your project context.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setView('launch')}
                className="bf-card group p-6 text-left transition hover:border-ember/50"
              >
                <p className="text-xs uppercase tracking-[0.2em] text-copper">Launch</p>
                <p className="mt-2 font-serif text-xl text-foreground group-hover:text-ember">
                  Distribute what you have made
                </p>
                <p className="mt-2 text-sm text-muted">
                  Post to Discord, Telegram, X, or LinkedIn — now or scheduled.
                </p>
              </button>
            </div>

            <button
              type="button"
              onClick={() => router.push('/chat')}
              className="text-sm text-muted transition hover:text-foreground"
            >
              Back to chat
            </button>
          </div>
        )}

        {view === 'create' && (
          <div className="space-y-6">
            <button
              type="button"
              onClick={() => { setView('home'); setGeneratedOutput(null); setSelectedType(null); setPrompt(''); }}
              className="text-sm text-muted transition hover:text-foreground"
            >
              Back
            </button>

            <div>
              <h2 className="font-serif text-2xl text-foreground">Create</h2>
              <p className="mt-1 text-sm text-muted">What do you want to make?</p>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              {CREATE_TYPES.map((type) => (
                <button
                  key={type.id}
                  type="button"
                  onClick={() => setSelectedType(type.id)}
                  className={`bf-card p-4 text-left transition ${
                    selectedType === type.id ? 'border-ember bg-ember/5' : 'hover:border-ember/40'
                  }`}
                >
                  <p className="text-sm font-semibold text-foreground">{type.label}</p>
                  <p className="mt-0.5 text-xs text-muted">{type.description}</p>
                </button>
              ))}
            </div>

            {selectedType && (
              <div className="space-y-3">
                <label htmlFor="studio-prompt" className="bf-section-label">
                  Describe what you need
                </label>
                <textarea
                  id="studio-prompt"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="A clear, specific description works best..."
                  rows={4}
                  className="bf-input resize-none"
                />
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={!prompt.trim() || isGenerating}
                  className="bf-button bf-button-primary"
                >
                  {isGenerating ? 'Generating…' : 'Generate'}
                </button>
              </div>
            )}

            {generatedOutput && (
              <div className="bf-card space-y-3 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-copper">Output</p>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{generatedOutput}</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setView('launch')}
                    className="bf-button bf-button-secondary"
                  >
                    Launch this
                  </button>
                  <button
                    type="button"
                    onClick={() => { setGeneratedOutput(null); setPrompt(''); }}
                    className="bf-button bf-button-secondary"
                  >
                    Create another
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {view === 'launch' && (
          <div className="space-y-6">
            <button
              type="button"
              onClick={() => { setView('home'); setSelectedPlatform(null); }}
              className="text-sm text-muted transition hover:text-foreground"
            >
              Back
            </button>

            <div>
              <h2 className="font-serif text-2xl text-foreground">Launch</h2>
              <p className="mt-1 text-sm text-muted">Where do you want to publish?</p>
            </div>

            <div className="grid gap-2">
              {LAUNCH_PLATFORMS.map((platform) => (
                <button
                  key={platform.id}
                  type="button"
                  onClick={() => setSelectedPlatform(platform.id)}
                  className={`bf-card p-4 text-left transition ${
                    selectedPlatform === platform.id ? 'border-ember bg-ember/5' : 'hover:border-ember/40'
                  }`}
                >
                  <p className="text-sm font-semibold text-foreground">{platform.label}</p>
                  <p className="mt-0.5 text-xs text-muted">{platform.description}</p>
                </button>
              ))}
            </div>

            {selectedPlatform && (
              <div className="space-y-3">
                <div className="bf-card p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-copper">Schedule</p>
                  <div className="mt-2 flex gap-2">
                    <button type="button" className="bf-button bf-button-primary">Post now</button>
                    <button type="button" className="bf-button bf-button-secondary">Schedule</button>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleLaunch}
                  className="bf-button bf-button-primary w-full"
                >
                  Confirm and launch
                </button>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
