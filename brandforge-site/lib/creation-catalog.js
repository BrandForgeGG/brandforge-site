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
  C(102, 'images', 'Quote card', 'One line worth sharing on a clean, branded card.', 'live', { kind: 'image', image: 'quote' }),
  C(106, 'images', 'Tip card', 'One useful idea, taught fast.', 'live', { kind: 'image', image: 'tip' }),
  C(107, 'images', 'Announcement', 'News, a launch or an update, sized for every feed.', 'live', { kind: 'image', image: 'announcement' }),
  C(108, 'images', 'Poll image', 'A question with lettered answers that people vote on in the comments.', 'live', { kind: 'image', image: 'question' }),
  C(103, 'images', 'Story or Reel cover', 'A vertical cover that makes people tap.', 'live', { kind: 'image', image: 'cover' }),
  C(104, 'images', 'Infographic', 'Numbers and steps laid out so they read at a glance.', 'live', { kind: 'image', image: 'infographic' }),
  C(105, 'images', 'Ad image', 'A headline, a line and a button, in square, portrait, story or wide.', 'live', { kind: 'image', image: 'ad' }),
  C(110, 'text', 'Update', 'A short post with bold, links and line breaks.', 'live', { kind: 'post', type: 'update' }),
  C(111, 'text', 'Poll', 'A question with two to ten answers people vote on.', 'live', { kind: 'post', type: 'poll' }),
  C(112, 'text', 'Quiz', 'A question with one right answer and a short explanation.', 'live', { kind: 'post', type: 'quiz' }),
  C(113, 'text', 'Thread', 'A story told over several linked posts.', 'live', { kind: 'post', type: 'thread' }),
  C(114, 'text', 'Link post', 'A link with your own comment to send people to a page.', 'live', { kind: 'post', type: 'update' }),
  C(120, 'video', 'Short vertical video', 'A clip under a minute, with captions and your brand.', 'live', { kind: 'video', format: 'short' }),
  C(121, 'video', 'Long video', 'A widescreen video from the same idea.', 'live', { kind: 'video', format: 'long' }),
  C(122, 'video', 'Video carousel', 'Several short clips swiped together.', 'live', { kind: 'video', format: 'square' }),
  C(123, 'video', 'Premiere', 'A video set to go live as a shared event.', 'building'),
  C(130, 'documents', 'Slide deck', 'A PDF deck that works as a swipeable document.', 'live', { kind: 'deck' }),
  C(131, 'documents', 'Article', 'A long-form piece with a headline, sections and a link back.', 'live', { kind: 'article' }),
  C(140, 'offers', 'Offer card', 'A deal with a code and a link.', 'live', { kind: 'image', image: 'offer' }),
  C(141, 'offers', 'Event card', 'An event with dates and a ticket link.', 'live', { kind: 'image', image: 'event' }),
  C(142, 'offers', 'Pin', 'An image that links back to your page.', 'live', { kind: 'image', image: 'pin' }),
];

module.exports = { GROUPS, CREATIONS };
