'use strict';

const TOOLS = [
  { name: 'brand', label: 'Brand Kit', description: 'Extract brand identity from a URL or logo', icon: 'palette' },
  { name: 'audit', label: 'Audit', description: 'Score any website 0-100 with actionable gaps', icon: 'search' },
  { name: 'research', label: 'Research', description: 'Competitor X-ray and market analysis', icon: 'radar' },
  { name: 'create', label: 'Create', description: 'Hooks, copy, and static creatives', icon: 'sparkles' },
  { name: 'video', label: 'Video', description: 'URL to video ad in minutes', icon: 'video' },
  { name: 'distribute', label: 'Distribute', description: 'Schedule and publish to social channels', icon: 'send' },
  { name: 'measure', label: 'Measure', description: 'Ad account X-ray and weekly digest', icon: 'chart' },
  { name: 'optimize', label: 'Optimize', description: 'Rules engine for budget and creative', icon: 'sliders' },
  { name: 'engage', label: 'Engage', description: 'Unified inbox for comments and DMs', icon: 'inbox' },
];

const SLASH_COMMANDS = [
  { name: 'brand', description: 'Extract brand kit from a URL' },
  { name: 'audit', description: 'Run instant audit on a URL' },
  { name: 'spy', description: 'Competitor X-ray' },
  { name: 'copy', description: 'Generate hooks and copy' },
  { name: 'ads', description: 'Create static ad creatives' },
  { name: 'video', description: 'Generate video ad from URL' },
  { name: 'schedule', description: 'Schedule posts to channels' },
  { name: 'report', description: 'Generate performance report' },
];

function getTools({ config: configOverride } = {}) {
  const { growthConfig } = require('./growth-config.js');
  const config = configOverride || growthConfig();
  return TOOLS.map((tool) => ({
    ...tool,
    enabled: config[tool.name === 'brand' ? 'brandKitEnabled' : `${tool.name}Enabled`] ?? false,
  }));
}

function getEnabledTools(opts) {
  return getTools(opts).filter((t) => t.enabled);
}

function getSlashCommands() {
  return SLASH_COMMANDS;
}

module.exports = { TOOLS, SLASH_COMMANDS, getTools, getEnabledTools, getSlashCommands };
