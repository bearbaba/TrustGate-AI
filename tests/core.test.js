import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeBadge, interpretBadge, verifyBadge } from '../lib/concordium.js';
import { toCents, policyDecision, evaluateIntent } from '../lib/engine.js';

const good = { badge_valid: true, extension_conformant: true, verification_present: true, issues: [], agent: { status: 'Active' } };
const verified = async () => ({ ok: true, code: 'BADGE_VERIFIED', badge: 'Mf22soLh1NuZYFgBK8iSs', checkedAt: '2026-11-20T00:00:00.000Z' });
const denied = async () => ({ ok: false, code: 'REVOKED', badge: null, checkedAt: '2026-11-20T00:00:00.000Z' });

test('short and canonical badge accepted without arbitrary URLs', () => {
  assert.equal(normalizeBadge('Mf22soLh1NuZYFgBK8iSs'), 'Mf22soLh1NuZYFgBK8iSs');
  assert.equal(normalizeBadge('ccd:abcd/cis-2:Mf22soLh1NuZYFgBK8iSs'), 'Mf22soLh1NuZYFgBK8iSs');
  assert.equal(normalizeBadge('https://evil.example/badge'), null);
  assert.equal(normalizeBadge('AAA/../../x'), null);
});
test('badge verdict requires every documented flag and no issues', () => {
  assert.equal(interpretBadge(good).valid, true);
  assert.equal(interpretBadge({ ...good, badge_valid: false }).valid, false);
  assert.equal(interpretBadge({ ...good, issues: ['hash-mismatch'] }).valid, false);
  assert.equal(interpretBadge({ ...good, agent: { status: 'Revoked' } }).valid, false);
  assert.equal(interpretBadge({ ...good, verification_present: undefined }).valid, false);
  assert.equal(interpretBadge({ ...good, issues: undefined }).valid, false);
});
test('verification fails closed when upstream is unavailable', async () => {
  const result = await verifyBadge('Mf22soLh1NuZYFgBK8iSs', { fetchImpl: async () => { throw Error('offline'); } });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'REGISTRY_UNAVAILABLE');
});
test('verification with fixture upstream response', async () => {
  const result = await verifyBadge('Mf22soLh1NuZYFgBK8iSs', { fetchImpl: async () => ({ ok: true, json: async () => good }) });
  assert.equal(result.ok, true);
});
test('integer cent handling avoids rounding errors and negatives', () => {
  assert.equal(toCents('0.01'), 1);
  assert.equal(toCents('4.99'), 499);
  assert.equal(toCents('1.234'), null);
  assert.equal(toCents('-1'), null);
  assert.equal(toCents('0'), null);
});
test('policy allow, review, block', () => {
  assert.equal(policyDecision({ amountCents: 200, recipient: 'research-api', purpose: 'Research' }).decision, 'ALLOW');
  assert.equal(policyDecision({ amountCents: 500, recipient: 'research-api', purpose: 'Research' }).decision, 'REVIEW');
  assert.equal(policyDecision({ amountCents: 1001, recipient: 'research-api', purpose: 'Research' }).decision, 'BLOCK');
  assert.equal(policyDecision({ amountCents: 200, recipient: 'unknown-service', purpose: 'Research' }).decision, 'BLOCK');
});
test('revoked identity forces BLOCK regardless of policy', async () => {
  const res = await evaluateIntent({ badge: 'Mf22soLh1NuZYFgBK8iSs', amountUsd: '2', recipient: 'research-api', purpose: 'Sources' }, { verify: denied });
  assert.equal(res.decision, 'BLOCK');
  assert.ok(res.reasons.includes('REVOKED'));
  assert.equal(res.execution, 'NOT_EXECUTED');
});
test('ALLOW is only non-executing policy decision with record digest', async () => {
  const res = await evaluateIntent({ badge: 'Mf22soLh1NuZYFgBK8iSs', amountUsd: '2', recipient: 'research-api', purpose: 'Sources' }, { verify: verified });
  assert.equal(res.decision, 'ALLOW');
  assert.match(res.digest, /^[a-f0-9]{64}$/);
  assert.equal(res.execution, 'NOT_EXECUTED');
});
