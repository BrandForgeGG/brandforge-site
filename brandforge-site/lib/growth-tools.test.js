'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { getTools, getEnabledTools, getSlashCommands, TOOLS, SLASH_COMMANDS } = require('./growth-tools.js');

test('getTools returns all tools with enabled flag', () => {
  const tools = getTools({ config: { brandKitEnabled: true, auditEnabled: false } });
  assert.equal(tools.length, TOOLS.length);
  const brand = tools.find((t) => t.name === 'brand');
  assert.equal(brand.enabled, true);
  const audit = tools.find((t) => t.name === 'audit');
  assert.equal(audit.enabled, false);
});

test('getEnabledTools filters to enabled only', () => {
  const tools = getEnabledTools({ config: { brandKitEnabled: true, auditEnabled: true, createEnabled: false } });
  assert.equal(tools.length, 2);
  assert.ok(tools.every((t) => t.enabled));
});

test('getSlashCommands returns the command list', () => {
  const commands = getSlashCommands();
  assert.equal(commands.length, SLASH_COMMANDS.length);
  assert.ok(commands.some((c) => c.name === 'brand'));
  assert.ok(commands.some((c) => c.name === 'audit'));
  assert.ok(commands.some((c) => c.name === 'spy'));
});

test('all tools have required fields', () => {
  for (const tool of TOOLS) {
    assert.ok(tool.name, `tool missing name`);
    assert.ok(tool.label, `tool ${tool.name} missing label`);
    assert.ok(tool.description, `tool ${tool.name} missing description`);
    assert.ok(tool.icon, `tool ${tool.name} missing icon`);
  }
});
