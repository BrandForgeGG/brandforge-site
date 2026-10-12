import type { MetadataRoute } from 'next';

// The web app manifest: how BrandForge installs to a phone's home screen and what it is called there.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'BrandForge: AI and people, one workspace',
    short_name: 'BrandForge',
    description: 'Make and publish every kind of message, trade products, services and requests, and hire the BrandForge team.',
    id: '/chat',
    start_url: '/chat',
    scope: '/',
    display: 'standalone',
    background_color: '#0f0e0d',
    theme_color: '#0f0e0d',
    categories: ['business', 'productivity', 'social'],
    icons: [
      { src: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { src: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png', purpose: 'any' },
    ],
    shortcuts: [
      { name: 'New chat', url: '/chat', description: 'Start something new' },
      { name: 'Create', url: '/create', description: 'Make a carousel, an ad or a quote' },
      { name: 'Distribute', url: '/distribute', description: 'A week of posts, written for you' },
      { name: 'Trade', url: '/trade', description: 'Hire or get hired' },
    ],
  };
}
