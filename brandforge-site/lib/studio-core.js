'use strict';

// Shared engine for the tool studios (Create, Distribute): a studio is a list of tools, each a small
// form that compiles into one clear request for the chat. Pure functions, no React, no network.

// Every tool accepts one optional reference: a page to read first and use as grounding.
const REFERENCE_FIELD = { key: 'reference', label: 'Reference page (optional)', type: 'url', placeholder: 'https://… we read it first' };

function normalizeUrl(raw) {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return '';
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(withScheme);
    return parsed.hostname.includes('.') ? parsed.toString() : '';
  } catch {
    return '';
  }
}

function makeStudio(tools) {
  function getTool(id) {
    return tools.find((tool) => tool.id === id) ?? null;
  }

  function defaultValues(tool) {
    const values = {};
    for (const field of tool.fields) {
      if (field.default !== undefined) values[field.key] = Array.isArray(field.default) ? [...field.default] : field.default;
      else values[field.key] = field.type === 'multi' ? [] : '';
    }
    values.reference = '';
    return values;
  }

  // Returns { ok: true, prompt } or { ok: false, error, field }.
  function compile(toolId, rawValues) {
    const tool = getTool(toolId);
    if (!tool) return { ok: false, error: 'Pick a tool first.', field: null };
    const values = { ...defaultValues(tool), ...(rawValues || {}) };

    for (const field of tool.fields) {
      const raw = values[field.key];
      if (field.type === 'url') {
        const url = normalizeUrl(raw);
        if (field.required && !url) return { ok: false, error: 'Enter a full web address, like yourwebsite.com.', field: field.key };
        values[field.key] = url;
      } else if (field.type === 'multi') {
        values[field.key] = Array.isArray(raw) ? raw : [];
      } else {
        values[field.key] = String(raw ?? '').trim();
        if (field.required && values[field.key].length < 3) {
          return { ok: false, error: `Add a little more detail to "${field.label}".`, field: field.key };
        }
      }
    }

    let prompt = tool.build(values);
    const reference = normalizeUrl(values.reference);
    if (String(values.reference ?? '').trim() && !reference) {
      return { ok: false, error: 'The reference page needs a full web address.', field: 'reference' };
    }
    if (reference) {
      prompt += ` Before you start, read ${reference} with research_web and use it as reference, citing what you used.`;
    }
    return { ok: true, prompt: prompt.replace(/\s+/g, ' ').trim() };
  }

  return { tools, getTool, defaultValues, compile };
}

// Lowercased, comma-joined list of chosen options with a fallback when none are chosen.
function listOrAll(chosen, all) {
  const list = chosen && chosen.length ? chosen : all;
  return list.map((item) => String(item)).join(', ');
}

module.exports = { REFERENCE_FIELD, normalizeUrl, makeStudio, listOrAll };
