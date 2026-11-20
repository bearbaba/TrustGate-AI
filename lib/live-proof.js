import { createHash, randomUUID } from 'node:crypto';
import { AccountAddress, verifyMessageSignature } from '@concordium/web-sdk';
import { ConcordiumGRPCNodeClient } from '@concordium/web-sdk/nodejs';
import { credentials } from '@grpc/grpc-js';
import { policyDecision, toCents, POLICY } from './engine.js';
import { verifyBadge } from './concordium.js';
import { PROOF_CONTEXT, validateProofRequest, buildSignedMessage } from './proof-message.js';

let client;
async function getAccountInfo(account) {
  if (!client) {
    client = new ConcordiumGRPCNodeClient(
      'grpc.testnet.concordium.com', 20000, credentials.createSsl(),
      { timeout: 10000 }
    );
  }
  return client.getAccountInfo(AccountAddress.fromBase58(account));
}
const hash = data => createHash('sha256').update(JSON.stringify(data)).digest('hex');
const base = (input) => ({
  id: randomUUID(), timestamp: new Date().toISOString(),
  badge: typeof input?.badge === 'string' ? input.badge.slice(0,100) : null,
  policyVersion: POLICY.policyVersion, mode:'SIGNED_READ_ONLY', payment:'NOT_EXECUTED',
  evidenceIssued: false
});

export async function runLiveProof(raw, options = {}) {
  const evaluated = base(raw);
  const checked = validateProofRequest(raw, options.now ?? Date.now());
  if (!checked.ok) return { ...evaluated, decision:'BLOCK', reasons:[checked.reason], receipt:null };
  const request = checked.request;
  const amountCents = toCents(request.amountUsd);
  const policy = policyDecision({amountCents, recipient:request.service, purpose:request.purpose});
  // Do not contact upstream services for requests the policy already rejects.
  if (policy.decision === 'BLOCK') return { ...evaluated, decision:'BLOCK', reasons:policy.reasons, receipt:null };
  if (policy.decision === 'REVIEW') return { ...evaluated, decision:'REVIEW', reasons:policy.reasons, receipt:null };

  const message = buildSignedMessage(request);
  let signatureVerified = false;
  try {
    const accountInfo = await (options.accountLookup || getAccountInfo)(request.account);
    signatureVerified = await (options.signatureVerifier || verifyMessageSignature)(message, raw.signature, accountInfo) === true;
  } catch {
    return { ...evaluated, decision:'BLOCK', reasons:['OWNER_SIGNATURE_VERIFICATION_UNAVAILABLE'], receipt:null };
  }
  if (!signatureVerified) return { ...evaluated, decision:'BLOCK', reasons:['INVALID_OWNER_SIGNATURE'], receipt:null };

  let identity;
  try { identity = await (options.badgeVerifier || verifyBadge)(request.badge); }
  catch { identity = { ok:false, code:'REGISTRY_UNAVAILABLE' }; }
  if (!identity?.ok || identity.checks?.status !== 'Active' ||
      identity.checks?.tokenId !== 1323 ||
      identity.checks?.ownerAccount !== PROOF_CONTEXT.owner ||
      identity.checks?.hashMatchesOnChain !== true) {
    return { ...evaluated, decision:'BLOCK', reasons:[identity?.code || 'REGISTRY_PROOF_INCOMPLETE'], receipt:null };
  }

  // Actual fulfilled action: returns a fresh verified on-chain provenance
  // snapshot. This is *public evidence*, not payment, paid content or an
  // authorization token to access a restricted resource.
  const evidence = {
    kind:'CONCORDIUM_VERIFIED_AGENT_SNAPSHOT',
    chain:'concordium:testnet',
    badge:request.badge, tokenId:identity.checks.tokenId,
    ownerAccount:identity.checks.ownerAccount,
    cardSha256:identity.checks.cardSha256,
    agentCardUrl:identity.checks.agentUri,
    registryVerificationUrl:identity.source,
    registryCheckedAt:identity.checkedAt,
    signatureVerified:true,
    requestNonce:request.nonce,
    intent:{service:request.service,amountUsd:request.amountUsd,purpose:request.purpose},
    scope:'PUBLIC_READ_ONLY',
  };
  const result = {...evaluated,decision:'ALLOW',reasons:['OWNER_SIGNATURE_VALID','ONCHAIN_BADGE_VERIFIED','POLICY_PASSED'],evidenceIssued:true,
    receipt: { ...evidence, digest:hash(evidence) }};
  result.auditDigest = hash({ ...result, receipt:result.receipt });
  return result;
}
