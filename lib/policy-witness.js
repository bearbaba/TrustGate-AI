import { POLICY, policyDecision, toCents } from './engine.js';
import { digestJson } from './receipt-format.js';

/**
 * A reproducible policy witness, not a server-issued attestation.
 * The witness is bound to the owner-signed request by the signature
 * verification performed by the independent receipt verifier.
 */
export const POLICY_MANIFEST = Object.freeze({
  id: 'trustgate-policy-witness',
  version: POLICY.policyVersion,
  allowedServices: [...POLICY.allowedServices].sort(),
  reviewFromCents: POLICY.reviewFromCents,
  perRequestCapCents: POLICY.perRequestCapCents,
  verification: 'CONCORDIUM_TESTNET_NATIVE_BADGE_AND_ACCOUNT_SIGNATURE',
  execution: 'PUBLIC_READ_ONLY'
});

export function policyManifestHash() {
  return digestJson(POLICY_MANIFEST);
}

export function makePolicyWitness(request) {
  const amountCents = toCents(request?.amountUsd);
  const outcome = policyDecision({
    amountCents,
    recipient: request?.service,
    purpose: request?.purpose
  });
  const signedIntent = {
    badge: request?.badge,
    account: request?.account,
    service: request?.service,
    amountUsd: request?.amountUsd,
    purpose: request?.purpose,
    nonce: request?.nonce,
    issuedAt: request?.issuedAt
  };
  return {
    format: 'trustgate-executable-policy-witness/v1',
    manifestHash: policyManifestHash(),
    policyVersion: POLICY_MANIFEST.version,
    requestHash: digestJson(signedIntent),
    amountCents,
    targetService: request?.service,
    decision: outcome.decision,
    reasons: [...outcome.reasons],
    action: outcome.decision === 'ALLOW' ? 'RETURN_PUBLIC_EVIDENCE' : 'NO_EVIDENCE',
    execution: 'NO_PAYMENT_EXECUTED'
  };
}

export function validatePolicyWitness(witness, signedRequest) {
  if (!witness || typeof witness !== 'object' || Array.isArray(witness)) return false;
  const expected = makePolicyWitness(signedRequest);
  return digestJson(witness) === digestJson(expected);
}
