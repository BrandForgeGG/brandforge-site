'use strict';

const { growthConfig } = require('./growth-config.js');

function createMeter({ admin, config: configOverride } = {}) {
  const config = configOverride || growthConfig();

  async function getDailyCost() {
    if (!admin) return 0;
    const today = new Date().toISOString().slice(0, 10);
    const { data, error } = await admin
      .from('usage_events')
      .select('cost_usd')
      .gte('created_at', `${today}T00:00:00.000Z`);

    if (error || !data) return 0;
    return data.reduce((sum, row) => sum + (Number(row.cost_usd) || 0), 0);
  }

  async function checkCostCeiling() {
    const dailyCost = await getDailyCost();
    return {
      ok: dailyCost < config.dailyCostCeilingUsd,
      dailyCost,
      ceiling: config.dailyCostCeilingUsd,
    };
  }

  async function recordUsage({ eventType, toolName, costUsd, tokensIn, tokensOut, metadata }) {
    if (!admin) return { recorded: false, reason: 'not_configured' };
    const { error } = await admin.from('usage_events').insert({
      event_type: eventType,
      tool_name: toolName || null,
      cost_usd: costUsd || 0,
      tokens_in: tokensIn || 0,
      tokens_out: tokensOut || 0,
      metadata: metadata || {},
    });
    if (error) {
      console.error('Usage record failed:', error.message);
      return { recorded: false, reason: error.message };
    }
    return { recorded: true };
  }

  async function getUsage({ projectId, eventType, since }) {
    if (!admin) return [];
    let query = admin.from('usage_events').select('*');
    if (projectId) query = query.eq('project_id', projectId);
    if (eventType) query = query.eq('event_type', eventType);
    if (since) query = query.gte('created_at', since);
    const { data, error } = await query.order('created_at', { ascending: false }).limit(100);
    if (error) return [];
    return data || [];
  }

  return { getDailyCost, checkCostCeiling, recordUsage, getUsage };
}

module.exports = { createMeter };
