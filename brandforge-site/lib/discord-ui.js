'use strict';

// Discord's button and popup-form layout for the BrandForge bot, as pure data so it can be tested.
// Same idea as the Telegram bot: a menu of buttons, one short question per button (a popup form
// here, a force-reply there), and follow-up buttons under every answer.
const { ASK, MENU, FOLLOWUPS } = require('./bot-core');

// Discord caps a popup field label at 45 characters, so these are the short forms of ASK.
const LABELS = {
  carousel: 'What should the carousel be about?',
  plan: "What's your idea?",
  audit: 'Which website? Send the address.',
  ads: 'What are you advertising?',
  calendar: "What's the business?",
  launch: 'What are you launching?',
  image: 'What should the image show?',
  video: 'What is the video about?',
  new: 'What do you want to build?',
};

const PRIMARY = 1;
const SECONDARY = 2;
const LINK = 5;
const EPHEMERAL = 64;

function button(label, customId, style = SECONDARY) {
  return { type: 2, style, label, custom_id: customId };
}

function linkButton(label, url) {
  return { type: 2, style: LINK, label, url };
}

/** The menu: up to five buttons a row, five rows at most. */
function menuComponents(siteUrl) {
  const all = MENU.flat().map(([label, kind]) => button(label, `ask:${kind}`, PRIMARY));
  const rows = [];
  for (let i = 0; i < all.length; i += 4) rows.push({ type: 1, components: all.slice(i, i + 4) });
  rows.push({ type: 1, components: [linkButton('Open BrandForge', siteUrl)] });
  return rows;
}

/** Buttons under every answer. */
function answerComponents(continueUrl) {
  const tap = (id) => button(FOLLOWUPS[id].label, `do:${id}`);
  return [
    { type: 1, components: [tap('shorter'), tap('deeper'), tap('ads'), tap('next')] },
    { type: 1, components: [button('Menu', 'menu'), linkButton('Continue in BrandForge', continueUrl)] },
  ];
}

/** The popup form that asks one question. Returns null for an unknown kind. */
function modalFor(kind) {
  if (!LABELS[kind]) return null;
  const title = (MENU.flat().find(([, k]) => k === kind) || [LABELS[kind]])[0];
  return {
    type: 9,
    data: {
      custom_id: `ask:${kind}`,
      title: String(title).slice(0, 45),
      components: [{ type: 1, components: [{ type: 4, custom_id: 'text', label: LABELS[kind], style: 2, min_length: 3, max_length: 1500, required: true }] }],
    },
  };
}

/** The text typed into a submitted popup form. */
function modalText(interaction) {
  const rows = (interaction && interaction.data && interaction.data.components) || [];
  for (const row of rows) {
    for (const field of row.components || []) {
      if (field.custom_id === 'text') return String(field.value || '').trim();
    }
  }
  return '';
}

module.exports = { LABELS, EPHEMERAL, menuComponents, answerComponents, modalFor, modalText };
