export const PROOF_CONTEXT = Object.freeze({
  badge: 'JyP9UhV91L3jWGjHH4aB7',
  owner: '34C1ozW8edKtBmA8FUFoR4aBys8ofuwtRmYqqbzNVPAsATT4wk',
  origin: 'https://trustgate-ai.vercel.app',
  network: 'concordium:testnet',
  service: 'evidence-oracle',
  version: 'trustgate-readonly-proof/v1',
  maxAgeMs: 90000,
});
// The request is signed without granting any spending or payment permission.
export function buildSignedMessage(request) {
  return [
    'TrustGate AI - PUBLIC read-only evidence request',
    'This is NOT a payment authorization.',
    'Domain: ' + PROOF_CONTEXT.origin,
    'Network: ' + PROOF_CONTEXT.network,
    'Version: ' + PROOF_CONTEXT.version,
    'Badge: ' + request.badge,
    'Account: ' + request.account,
    'Service: ' + request.service,
    'AmountUSD: ' + request.amountUsd,
    'Purpose: ' + request.purpose,
    'Nonce: ' + request.nonce,
    'IssuedAt: ' + request.issuedAt
  ].join('\n');
}

export function validateProofRequest(raw, now = Date.now()) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, reason: 'INVALID_REQUEST' };
  if (raw.badge !== PROOF_CONTEXT.badge || raw.account !== PROOF_CONTEXT.owner) return { ok: false, reason: 'UNSUPPORTED_AGENT_OR_ACCOUNT' };
  if (raw.service !== PROOF_CONTEXT.service) return { ok: false, reason: 'SERVICE_NOT_ALLOWLISTED' };
  if (typeof raw.amountUsd !== 'string' || !/^(0|[1-9]\d{0,3})(\.\d{1,2})?$/.test(raw.amountUsd)) return {ok:false,reason:'INVALID_AMOUNT'};
  if (typeof raw.purpose !== 'string' || raw.purpose.length < 5 || raw.purpose.length > 140 || /[\r\n\x00-\x1f]/.test(raw.purpose)) return { ok:false, reason:'INVALID_PURPOSE' };
  if (typeof raw.nonce !== 'string' || !/^[a-f0-9]{32}$/.test(raw.nonce)) return { ok:false, reason:'INVALID_NONCE' };
  if (!Number.isSafeInteger(raw.issuedAt) || raw.issuedAt > now + 5000 || now - raw.issuedAt > PROOF_CONTEXT.maxAgeMs) return { ok:false, reason:'REQUEST_EXPIRED' };
  if (!raw.signature || typeof raw.signature !== 'object' || Array.isArray(raw.signature) || JSON.stringify(raw.signature).length > 5000) return {ok:false, reason:'INVALID_SIGNATURE_FORMAT'};
  return {ok:true, request:{
    badge:raw.badge, account:raw.account, service:raw.service, amountUsd:raw.amountUsd,
    purpose:raw.purpose, nonce:raw.nonce, issuedAt:raw.issuedAt
  }};
}
