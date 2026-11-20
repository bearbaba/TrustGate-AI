import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeBadge, interpretBadge, verifyBadge } from '../lib/concordium.js';
import { toCents, policyDecision, evaluateIntent } from '../lib/engine.js';

const official = {
  token_id: 1323, token_address: 'JyP9UhV91L3jWGjHH4aB7',
  agent_uri: 'https://trustgate-ai.vercel.app/.well-known/agent-card.json',
  http_status: 200,
  card_sha256: 'ed33956577d378ef0bfd537505863d846a2c130513302a2d45d99e5bfc009c44',
  network: 'testnet',
  on_chain: {
    owner_account: '34C1ozW8edKtBmA8FUFoR4aBys8ofuwtRmYqqbzNVPAsATT4wk',
    status: 'Active',
    agent_uri: 'https://trustgate-ai.vercel.app/.well-known/agent-card.json',
    metadata_hash_hex: 'ed33956577d378ef0bfd537505863d846a2c130513302a2d45d99e5bfc009c44'
  },
  checks: {
    on_chain_agent_found: true, status_active: true, has_agent_uri: true,
    card_fetched: true, hash_matches_on_chain: true, badge_present: true,
    badge_embedding: 'extension', badge_well_formed: true,
    token_address_matches: true, owner_matches: true, contracts_match: true,
    verify_present: true, extension_conformant: true,
    verification_present: true, verify_url_matches: true
  },
  badge_valid: true, issues: []
};

const verified = async () => ({ ok: true, code: 'BADGE_VERIFIED', badge: 'Mf22soLh1NuZYFgBK8iSs', checkedAt: '2026-11-20T00:00:00.000Z' });
const denied = async () => ({ ok: false, code: 'REVOKED', badge: null, checkedAt: '2026-11-20T00:00:00.000Z' });

test('short and canonical badge accepted without arbitrary URLs', () => {
  assert.equal(normalizeBadge('Mf22soLh1NuZYFgBK8iSs'), 'Mf22soLh1NuZYFgBK8iSs');
  assert.equal(normalizeBadge('ccd:abcd/cis-2:Mf22soLh1NuZYFgBK8iSs'), 'Mf22soLh1NuZYFgBK8iSs');
  assert.equal(normalizeBadge('https://evil.example/badge'), null);
  assert.equal(normalizeBadge('AAA/../../x'), null);
});
test('official Concordium nested-check response for Agent #1323 passes', () => {
  const verdict = interpretBadge(official);
  assert.equal(verdict.valid, true);
  assert.equal(verdict.summary.extensionConformant, true);
  assert.equal(verdict.summary.verificationPresent, true);
  assert.equal(verdict.summary.hashMatchesOnChain, true);
  assert.equal(verdict.summary.tokenId, 1323);
});
test('official registry response fails closed on incomplete or inconsistent proof', () => {
  const changed = (patch) => ({ ...official, ...patch });
  assert.equal(interpretBadge(changed({ badge_valid: false })).valid, false);
  assert.equal(interpretBadge(changed({ issues: ['hash mismatch'] })).valid, false);
  assert.equal(interpretBadge(changed({ checks: undefined })).valid, false);
  assert.equal(interpretBadge(changed({ checks: { ...official.checks, extension_conformant: false } })).valid, false);
  assert.equal(interpretBadge(changed({ checks: { ...official.checks, hash_matches_on_chain: false } })).valid, false);
  assert.equal(interpretBadge(changed({ checks: { ...official.checks, owner_matches: false } })).valid, false);
  assert.equal(interpretBadge(changed({ checks: { ...official.checks, verification_present: undefined } })).valid, false);
  assert.equal(interpretBadge(changed({ on_chain: { ...official.on_chain, status: 'Revoked' } })).valid, false);
  assert.equal(interpretBadge(changed({ on_chain: { ...official.on_chain, metadata_hash_hex: '0'.repeat(64) } })).valid, false);
  assert.equal(interpretBadge(changed({ agent_uri: 'https://different.example/card.json' })).valid, false);
  assert.equal(interpretBadge(changed({ http_status: 404 })).valid, false);
  assert.equal(interpretBadge(changed({ network: 'mainnet' })).valid, false);
  assert.equal(interpretBadge(changed({ issues: undefined })).valid, false);
});

test('verification fails closed when upstream is unavailable', async () => {
  const result = await verifyBadge('Mf22soLh1NuZYFgBK8iSs', { fetchImpl: async () => { throw Error('offline'); } });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'REGISTRY_UNAVAILABLE');
});
test('verification with fixture upstream response', async () => {
  const result = await verifyBadge('Mf22soLh1NuZYFgBK8iSs', { fetchImpl: async () => ({ ok: true, json: async () => official }) });
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

test('real registry JSON structure can ALLOW without an actual payment', async () => {
  const result = await evaluateIntent({
    badge: 'JyP9UhV91L3jWGjHH4aB7', recipient: 'research-api',
    amountUsd: '2.00', purpose: 'Retrieve public sources'
  }, { verify: async badge => {
    const verdict = interpretBadge(official);
    return { ok: verdict.valid, code: verdict.reason, badge, checkedAt: new Date().toISOString(), checks: verdict.summary };
  } });
  assert.equal(result.decision, 'ALLOW');
  assert.equal(result.identityCheck.verified, true);
  assert.equal(result.execution, 'NOT_EXECUTED');
});
