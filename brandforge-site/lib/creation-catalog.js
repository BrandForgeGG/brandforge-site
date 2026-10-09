'use strict';

// What a person can MAKE, with no platform in it: a carousel, a poll, a video. This is the Create page's
// list. (Where it can be posted is the Distribute page's list, lib/format-catalog.js.) Same statuses:
//   live      works now; a tool opens it
//   building  not built yet
// "n" starts at 100 so a vote on a creation never collides with a distribution format.

const GROUPS = [
  { id: 'images', label: 'Images' },
  { id: 'text', label: 'Text and engagement' },
  { id: 'video', label: 'Video' },
  { id: 'documents', label: 'Documents and articles' },
  { id: 'offers', label: 'Offers and events' },
];

const C = (n, group, name, line, status, tool) => ({ n, group, platform: '', name, line, status, ...(tool ? { tool } : {}) });

const CREATIONS = [
  C(100, 'images', 'Carousel', 'Swipeable slides from one sentence, with a cover picture painted from your topic.', 'live', { kind: 'carousel' }),
  C(101, 'images', 'Single image post', 'One strong image with a headline, sized for every feed.', 'building'),
  C(102, 'images', 'Quote card', 'A quote or a tip on a clean, branded card.', 'building'),
  C(103, 'images', 'Story or Reel cover', 'A vertical cover that makes people tap.', 'building'),
  C(104, 'images', 'Infographic', 'Numbers and steps laid out so they read at a glance.', 'building'),
  C(105, 'images', 'Ad image', 'Ad creatives sized for the big ad platforms.', 'building'),
  C(110, 'text', 'Update', 'A short post with bold, links and line breaks.', 'live', { kind: 'post', type: 'update' }),
  C(111, 'text', 'Poll', 'A question with two to ten answers people vote on.', 'live', { kind: 'post', type: 'poll' }),
  C(112, 'text', 'Quiz', 'A question with one right answer and a short explanation.', 'live', { kind: 'post', type: 'quiz' }),
  C(113, 'text', 'Thread', 'A story told over several linked posts.', 'live', { kind: 'post', type: 'thread' }),
  C(114, 'text', 'Link post', 'A link with your own comment to send people to a page.', 'building'),
  C(120, 'video', 'Short vertical video', 'A clip under a minute, with captions and your brand.', 'building'),
  C(121, 'video', 'Long video', 'A widescreen video from the same idea.', 'building'),
  C(122, 'video', 'Video carousel', 'Several short clips swiped together.', 'building'),
  C(123, 'video', 'Premiere', 'A video set to go live as a shared event.', 'building'),
  C(130, 'documents', 'Slide deck', 'A PDF deck that works as a swipeable document.', 'building'),
  C(131, 'documents', 'Article', 'A long-form piece with a headline, sections and a link back.', 'building'),
  C(140, 'offers', 'Offer card', 'A deal with a code and a link.', 'building'),
  C(141, 'offers', 'Event card', 'An event with dates and a ticket link.', 'building'),
  C(142, 'offers', 'Pin', 'An image that links back to your page.', 'building'),
];

module.exports = { GROUPS, CREATIONS };
