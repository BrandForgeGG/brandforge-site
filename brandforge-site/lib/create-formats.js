'use strict';

// "Start from a format": a guided tree for the three asset tools. Direction (2) -> track (4) ->
// format (6+). Picking a format only pre-fills the form (a lead-in sentence plus the matching
// options); the person still describes the subject and can change everything.

const f = (direction, track, label, lead, values = {}) => ({ direction, track, label, lead, values });

const IMAGE = [
  // Digital: brand identity
  f('Digital', 'Brand identity', 'Logo', 'A logo for ', { format: 'Square', style: 'Flat vector' }),
  f('Digital', 'Brand identity', 'Favicon', 'A simple favicon icon for ', { format: 'Square', style: 'Flat vector' }),
  f('Digital', 'Brand identity', 'App icon', 'An app icon for ', { format: 'Square', style: '3D render' }),
  f('Digital', 'Brand identity', 'Icon set', 'A matching set of simple icons for ', { format: 'Square', style: 'Flat vector' }),
  f('Digital', 'Brand identity', 'Website banner', 'A wide website banner for ', { format: 'Landscape', style: 'Illustration' }),
  f('Digital', 'Brand identity', 'Email header', 'An email header image for ', { format: 'Landscape', style: 'Flat vector' }),
  // Digital: marketing and content
  f('Digital', 'Marketing and content', 'Ad creative', 'An ad creative for ', { format: 'Square', style: 'Photo' }),
  f('Digital', 'Marketing and content', 'Carousel slide', 'A bold social carousel slide about ', { format: 'Portrait', style: 'Illustration' }),
  f('Digital', 'Marketing and content', 'YouTube thumbnail', 'A high-contrast YouTube thumbnail for ', { format: 'Landscape', style: 'Cinematic' }),
  f('Digital', 'Marketing and content', 'Social header', 'A social media header for ', { format: 'Landscape', style: 'Illustration' }),
  f('Digital', 'Marketing and content', 'Infographic', 'A simple infographic explaining ', { format: 'Portrait', style: 'Flat vector' }),
  // Physical: merchandise
  f('Physical', 'Merchandise', 'T-shirt graphic', 'A t-shirt graphic: ', { format: 'Square', style: 'Flat vector' }),
  f('Physical', 'Merchandise', 'Hoodie design', 'A hoodie design: ', { format: 'Portrait', style: 'Flat vector' }),
  f('Physical', 'Merchandise', 'Tote bag print', 'A tote bag print: ', { format: 'Square', style: 'Flat vector' }),
  f('Physical', 'Merchandise', 'Mug wrap', 'A wrap-around mug design: ', { format: 'Landscape', style: 'Illustration' }),
  f('Physical', 'Merchandise', 'Sticker', 'A die-cut sticker design: ', { format: 'Square', style: 'Flat vector' }),
  // Physical: print
  f('Physical', 'Print', 'Business card', 'A business card design for ', { format: 'Landscape', style: 'Flat vector' }),
  f('Physical', 'Print', 'Flyer', 'A flyer for ', { format: 'Portrait', style: 'Illustration' }),
  f('Physical', 'Print', 'Poster', 'A poster for ', { format: 'Portrait', style: 'Illustration' }),
  f('Physical', 'Print', 'Packaging', 'Product packaging for ', { format: 'Square', style: '3D render' }),
  f('Physical', 'Print', 'Label', 'A product label for ', { format: 'Square', style: 'Flat vector' }),
  f('Physical', 'Print', 'Menu', 'A menu design for ', { format: 'Portrait', style: 'Flat vector' }),
];

const COPY = [
  // External: conversion copywriting
  f('Public', 'Conversion copy', 'Ad angles', 'Meta and Google ad angles for ', { kind: 'Ad angles', length: 'Short' }),
  f('Public', 'Conversion copy', 'Product description', 'A product description for ', { kind: 'Product description', length: 'Short' }),
  f('Public', 'Conversion copy', 'Landing page', 'A landing page for ', { kind: 'Landing page', length: 'Medium' }),
  f('Public', 'Conversion copy', 'Email sequence', 'A welcome email sequence for ', { kind: 'Email sequence', length: 'Medium' }),
  // External: editorial
  f('Public', 'Editorial', 'SEO blog post', 'An SEO blog post about ', { kind: 'SEO blog post', length: 'Long' }),
  f('Public', 'Editorial', 'Newsletter', 'A newsletter issue about ', { kind: 'Newsletter', length: 'Medium' }),
  f('Public', 'Editorial', 'Thread', 'A thread for X or Threads about ', { kind: 'Thread', length: 'Medium' }),
  f('Public', 'Editorial', 'Press release', 'A press release announcing ', { kind: 'Press release', length: 'Medium' }),
  // Internal: technical writing
  f('Internal', 'Technical writing', 'Explainer script', 'An explainer video script about ', { kind: 'Explainer script', length: 'Medium' }),
  f('Internal', 'Technical writing', 'Help article', 'A help centre article on ', { kind: 'Help article', length: 'Medium' }),
  // Internal: executive business
  f('Internal', 'Executive business', 'Brand manifesto', 'A brand manifesto for ', { kind: 'Brand manifesto', length: 'Short' }),
  f('Internal', 'Executive business', 'Investor update', 'A monthly investor update for ', { kind: 'Investor update', length: 'Medium' }),
];

const VIDEO = [
  // Social and web: organic
  f('Social and web', 'Organic social', 'TikTok video', 'A fast, vertical TikTok about ', { scenes: '4', tone: 'Playful' }),
  f('Social and web', 'Organic social', 'Instagram Reel', 'An Instagram Reel about ', { scenes: '4', tone: 'Friendly' }),
  f('Social and web', 'Organic social', 'YouTube Short', 'A YouTube Short about ', { scenes: '3', tone: 'Bold' }),
  f('Social and web', 'Organic social', 'LinkedIn clip', 'A LinkedIn clip about ', { scenes: '3', tone: 'Professional' }),
  // Social and web: displays
  f('Social and web', 'Displays and promos', 'Website hero', 'A looping website hero video for ', { scenes: '3', tone: 'Luxury', style: 'Cinematic' }),
  f('Social and web', 'Displays and promos', 'Signage loop', 'A digital signage loop for ', { scenes: '3', tone: 'Bold' }),
  f('Social and web', 'Displays and promos', 'App Store preview', 'An App Store preview for ', { scenes: '4', tone: 'Friendly' }),
  f('Social and web', 'Displays and promos', 'Product video', 'A product video for ', { scenes: '4', tone: 'Professional' }),
  // Business and ads: paid ads
  f('Business and ads', 'Paid ads', 'Meta Reel ad', 'A Meta Reel ad for ', { scenes: '3', tone: 'Bold' }),
  f('Business and ads', 'Paid ads', 'TikTok ad', 'A TikTok ad for ', { scenes: '3', tone: 'Playful' }),
  f('Business and ads', 'Paid ads', 'YouTube bumper', 'A 6-second YouTube bumper ad for ', { scenes: '3', tone: 'Bold' }),
  f('Business and ads', 'Paid ads', 'LinkedIn video ad', 'A LinkedIn video ad for ', { scenes: '3', tone: 'Professional' }),
  // Business and ads: corporate
  f('Business and ads', 'Corporate and info', 'Explainer', 'An explainer video for ', { scenes: '4', tone: 'Friendly' }),
  f('Business and ads', 'Corporate and info', 'Testimonial', 'A customer testimonial video for ', { scenes: '3', tone: 'Friendly' }),
  f('Business and ads', 'Corporate and info', 'Tutorial', 'A short tutorial video on ', { scenes: '4', tone: 'Professional' }),
  f('Business and ads', 'Corporate and info', 'Pitch slides', 'A pitch video for ', { scenes: '4', tone: 'Professional' }),
];

const FORMATS = { image: IMAGE, copy: COPY, video: VIDEO };

// Copy kinds the formats above rely on (appended to the tool's own chips).
const EXTRA_COPY_KINDS = ['Ad angles', 'SEO blog post', 'Newsletter', 'Thread', 'Explainer script', 'Help article', 'Brand manifesto', 'Investor update'];

module.exports = { FORMATS, EXTRA_COPY_KINDS };
