'use strict';

// Every content format BrandForge is meant to make and publish, by platform, and where each one honestly
// stands today. The UI shows this list. Only "live" formats can be used; the rest say why not:
//   live      works now and can be opened from the page
//   setup     built, waiting for a one-time key from us (not for the person)
//   approval  waiting for the platform to approve our app
//   building  not built yet
// "n" is the number in the original plan. A tool says which composer a live format opens.

const GROUPS = [
  { id: 'carousels', label: 'Carousels and multi-image posts' },
  { id: 'polls', label: 'Polls and quizzes' },
  { id: 'text', label: 'Short text and threads' },
  { id: 'chat', label: 'Chat and community posts' },
  { id: 'pins', label: 'Pins and curation' },
  { id: 'short', label: 'Short vertical video' },
  { id: 'long', label: 'Long and standard video' },
  { id: 'local', label: 'Google Business and local' },
  { id: 'articles', label: 'Articles' },
  { id: 'niche', label: 'More' },
];

const F = (n, group, platform, name, line, status, tool) => ({ n, group, platform, name, line, status, ...(tool ? { tool } : {}) });

const FORMATS = [
  // Carousels
  F(0, 'carousels', 'telegram', 'Carousel to your channels', 'A swipeable carousel with a cover picture, posted to Telegram, Discord, Bluesky or Tumblr.', 'live', { kind: 'carousel' }),
  F(11, 'carousels', 'instagram', 'Instagram image carousel', 'Up to 10 swipeable photos in one post. Download the slides and post from the app today.', 'approval'),
  F(12, 'carousels', 'instagram', 'Instagram video carousel', 'Several short clips swiped together in one post.', 'building'),
  F(13, 'carousels', 'linkedin', 'LinkedIn slide deck', 'A PDF that LinkedIn turns into swipeable cards.', 'building'),
  F(14, 'carousels', 'facebook', 'Facebook multi-image post', 'A photo set shown as a collage on your Page.', 'approval'),
  F(15, 'carousels', 'threads', 'Threads carousel', 'Swipeable text and images for Threads.', 'approval'),
  F(16, 'carousels', 'tiktok', 'TikTok photo carousel', 'A swipeable photo stack on TikTok.', 'approval'),
  // Polls
  F(17, 'polls', 'telegram', 'Telegram poll', 'A real poll in your channel or group.', 'live', { kind: 'post', type: 'poll', platform: 'telegram' }),
  F(18, 'polls', 'telegram', 'Telegram quiz', 'A question with one right answer and a short explanation.', 'live', { kind: 'post', type: 'quiz', platform: 'telegram' }),
  F(19, 'polls', 'reddit', 'Reddit poll', 'A community vote inside a subreddit.', 'building'),
  F(20, 'polls', 'discord', 'Discord poll', 'A native poll your members vote on.', 'live', { kind: 'post', type: 'poll', platform: 'discord' }),
  // Text
  F(21, 'text', 'bluesky', 'Bluesky thread', 'A story told over linked posts, with clickable links.', 'live', { kind: 'post', type: 'thread', platform: 'bluesky' }),
  F(22, 'text', 'mastodon', 'Mastodon post', 'A short post on your Mastodon server.', 'building'),
  F(23, 'text', 'threads', 'Threads post', 'A quick update with links and mentions.', 'approval'),
  F(24, 'text', 'reddit', 'Reddit link post', 'A title and a link, to send traffic to a page.', 'building'),
  F(25, 'text', 'slack', 'Slack announcement with @here', 'An update that pings the channel.', 'building'),
  // Chat
  F(30, 'chat', 'telegram', 'Telegram rich-text post', 'An update with bold, code and links.', 'live', { kind: 'post', type: 'update', platform: 'telegram' }),
  F(31, 'chat', 'discord', 'Discord embed', 'An announcement card with an accent colour.', 'live', { kind: 'post', type: 'update', platform: 'discord' }),
  F(32, 'chat', 'slack', 'Slack message', 'A formatted message with sections, posted through a webhook.', 'live', { kind: 'post', type: 'update', platform: 'slack' }),
  F(33, 'chat', 'whatsapp', 'WhatsApp utility message', 'A pre-approved transactional message.', 'approval'),
  F(34, 'chat', 'whatsapp', 'WhatsApp marketing message', 'A promotional message with reply buttons.', 'approval'),
  F(49, 'chat', 'discord', 'Discord quick text', 'A plain message dropped into a channel in one step.', 'live', { kind: 'post', type: 'update', platform: 'discord' }),
  // Pins
  F(41, 'pins', 'pinterest', 'Pinterest pin', 'An image that links back to your page.', 'approval'),
  F(42, 'pins', 'pinterest', 'Pinterest video pin', 'A looping vertical video pin.', 'building'),
  F(43, 'pins', 'tumblr', 'Tumblr photo post', 'Your carousel as a photo post on your blog.', 'setup'),
  F(44, 'pins', 'tumblr', 'Tumblr text post', 'A text post with formatting on your blog.', 'setup', undefined),
  F(45, 'pins', 'tumblr', 'Tumblr link post', 'A link with your own comment.', 'building'),
  // Short video
  F(1, 'short', 'tiktok', 'TikTok video', 'A vertical video on your profile.', 'building'),
  F(2, 'short', 'instagram', 'Instagram Reel', 'A vertical clip for Reels.', 'building'),
  F(3, 'short', 'facebook', 'Facebook Reel', 'A short vertical video for Reels on Facebook.', 'building'),
  F(4, 'short', 'youtube', 'YouTube Short', 'A vertical video under 60 seconds.', 'building'),
  F(5, 'short', 'pinterest', 'Pinterest Idea Pin', 'A short vertical clip pin.', 'building'),
  // Long video
  F(6, 'long', 'youtube', 'YouTube video', 'A widescreen video upload.', 'building'),
  F(7, 'long', 'linkedin', 'LinkedIn video', 'A landscape or square clip for the feed.', 'building'),
  F(8, 'long', 'facebook', 'Facebook Page video', 'A standard video for your Page.', 'building'),
  F(9, 'long', 'reddit', 'Reddit video', 'A video uploaded to Reddit.', 'building'),
  F(10, 'long', 'telegram', 'Telegram video', 'A compressed video sent to your channel.', 'building'),
  // Local
  F(26, 'local', 'google', 'Google Business update', 'News and announcements on your listing.', 'approval'),
  F(27, 'local', 'google', 'Google Business offer', 'A deal with a code and a link.', 'approval'),
  F(28, 'local', 'google', 'Google Business event', 'An event with dates and a ticket link.', 'approval'),
  F(29, 'local', 'google', 'Google Business photo', 'Photos added to your listing.', 'approval'),
  // Articles
  F(35, 'articles', 'medium', 'Medium story', 'A published article with a canonical link.', 'building'),
  F(36, 'articles', 'medium', 'Medium draft', 'A draft pushed to your profile to review.', 'building'),
  // More
  F(46, 'niche', 'youtube', 'YouTube premiere', 'A video that goes live as a shared event.', 'building'),
  F(47, 'niche', 'reddit', 'Reddit gallery', 'Several images in one post.', 'building'),
  F(48, 'niche', 'linkedin', 'LinkedIn article', 'A long-form article on your profile.', 'approval'),
  F(50, 'niche', 'bluesky', 'Bluesky image post', 'One image with descriptive alt text.', 'building'),
];

const STATUS_LABEL = {
  live: 'Live',
  setup: 'Almost ready',
  approval: 'Waiting for approval',
  building: 'Not built yet',
};

module.exports = { GROUPS, FORMATS, STATUS_LABEL };
