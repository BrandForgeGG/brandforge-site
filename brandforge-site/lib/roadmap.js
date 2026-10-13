'use strict';

// Explore: where BrandForge is going, what works today, what is being built now, and what still has to happen. Plain and
// true: a line moves from "next" to "building" to "live" only when that is so. Edit here; the Explore page follows.
const DIRECTION = [
  { title: 'AI drafts, people finish', body: 'Describe it once. AI researches, plans and makes the first version in seconds, and a person takes it the rest of the way when you want one.' },
  { title: 'One week, every channel', body: 'Say what you promote and get a week of posts with pictures, captions and times, sent to every place you post on its own.' },
  { title: 'Work that pays fairly', body: 'Hire or get hired in Trade. Every job is a milestone contract, paid from escrow only when the work is approved.' },
];

// status: live (works today), building (being made or waiting on one step), next (not started, needed).
const ROADMAP = [
  { status: 'live', title: 'A chat that does the work', body: 'Ideas, links and files become a researched plan, a fix list or a draft.' },
  { status: 'live', title: 'Create', body: 'Carousels, ads, quotes, tips, announcements and polls from one sentence, ready to download.' },
  { status: 'live', title: 'Distribute', body: 'A week of posts written for you, posted or scheduled to LinkedIn, Bluesky, Tumblr, Mastodon, Telegram and Discord.' },
  { status: 'live', title: 'Trade', body: 'Anyone lists a gig, product or request. Terms are agreed in a private chat and paid by milestone from escrow.' },
  { status: 'live', title: 'Community', body: 'Share what you made on Create and Distribute and see what others are making.', since: '2026-10-13' },
  { status: 'building', title: 'Instagram, Facebook and Threads', body: 'Built. Waiting for the Meta app to be set up, then for Meta to review it before everyone can connect.' },
  { status: 'building', title: 'LinkedIn pictures', body: 'Connecting your LinkedIn works. Posting with pictures is being fixed.' },
  { status: 'building', title: 'X', body: 'Paused: X charges for every post and BrandForge cannot afford it yet. Donations turn it back on.' },
  { status: 'next', title: 'TikTok', body: 'Photo posts and slideshows, after TikTok audits the app.' },
  { status: 'next', title: 'Video', body: 'Short videos for Reels, Shorts and TikTok, made the same way as carousels.' },
  { status: 'next', title: 'Work we can show', body: 'The first client projects delivered through BrandForge, shown with their permission.' },
];

const STATUS_LABEL = { live: 'Live', building: 'Building now', next: 'Needs to happen' };

module.exports = { DIRECTION, ROADMAP, STATUS_LABEL };
