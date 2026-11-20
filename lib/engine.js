import { createHash, randomUUID } from 'node:crypto';
import { verifyBadge } from './concordium.js';

export const POLICY = Object.freeze({
  allowedServices: ['research-api', 'evidence-oracle', 'audit-service'],
  perRequestCapCents: 1000,
  reviewFromCents: 500,
  policyVersion: 'trustgate-policy/0.1'
});

export function toCents(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const str = String(value).trim();
  if (!/^(0|[1-9]\d{0,5})(\.\d{1,2})?$/.test(str)) return null;
  const [whole, fraction = ''] = str.split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

export function policyDecision({ amountCents, recipient, purpose }, policy = POLICY) {
  if (!Number.isInteger(amountCents) || amountCents <= 0) return { decision: 'BLOCK', reasons: ['INVALID_AMOUNT'] };
  if (typeof recipient !== 'string' || !policy.allowedServices.includes(recipient)) return { decision: 'BLOCK', reasons: ['RECIPIENT_NOT_ALLOWLISTED'] };
  if (typeof purpose !== 'string' || !purpose.trim() || purpose.length > 300) return { decision: 'BLOCK', reasons: ['INVALID_PURPOSE'] };
  if (amountCents > policy.perRequestCapCents) return { decision: 'BLOCK', reasons: ['PER_REQUEST_CAP_EXCEEDED'] };
  if (amountCents >= policy.reviewFromCents) return { decision: 'REVIEW', reasons: ['HUMAN_APPROVAL_REQUIRED'] };
  return { decision: 'ALLOW', reasons: ['POLICY_PASSED'] };
}

export async function evaluateIntent(body, options = {}) {
  const amountCents = toCents(body?.amountUsd);
  const recipient = body?.recipient;
  const purpose = body?.purpose;
  const identity = await (options.verify || verifyBadge)(body?.badge);
  const policy = policyDecision({ amountCents, recipient, purpose });
  const decision = !identity.ok ? 'BLOCK' : policy.decision;
  const reasons = identity.ok ? policy.reasons : [identity.code, ...policy.reasons.filter(x => x !== 'POLICY_PASSED')];
  const audit = {
    id: randomUUID(), evaluatedAt: new Date().toISOString(), badge: identity.badge || null,
    recipient: typeof recipient === 'string' ? recipient.slice(0, 64) : null,
    amountCents, purpose: typeof purpose === 'string' ? purpose.slice(0, 300) : null,
    decision, reasons, policyVersion: POLICY.policyVersion,
    identityCheck: {
      verified: identity.ok, code: identity.code, checkedAt: identity.checkedAt,
      source: identity.source || null, checks: identity.checks || null
    },
    execution: 'NOT_EXECUTED'
  };
  const digest = createHash('sha256').update(JSON.stringify(audit)).digest('hex');
  return { ...audit, digest, notice: 'ALLOW is a policy outcome only. No transaction, signing, x402 payment or ledger persistence occurs.' };
}
