import { verifyMessageSignature } from '@concordium/web-sdk';
import { PROOF_CONTEXT, validateProofRequest, buildSignedMessage } from './proof-message.js';
import { validateDigest } from './receipt-format.js';
import { validatePolicyWitness } from './policy-witness.js';
import { verifyBadge } from './concordium.js';
import { getAccountInfo } from './live-proof.js';

export async function verifyEvidenceReceipt(receipt, options = {}) {
  const report = (code, extra = {}) => ({
    ok: false, code, checks: {
      integrity: false, requestBinding: false, policyWitness: false,
      ownerSignature: false, currentRegistry: false, currentCardMatch: false,
      ...extra
    },
    limitation: 'Verifies owner-signed request and current on-chain identity, NOT server issuance time or payment.',
  });
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt) ||
      JSON.stringify(receipt).length > 20000) return report('INVALID_RECEIPT');
  if (!validateDigest(receipt)) return report('RECEIPT_INTEGRITY_MISMATCH');
  const proof = receipt.proof;
  const request = proof?.request;
  const signature = proof?.ownerSignature;
  const checkedAt = Number.isSafeInteger(request?.issuedAt) ? request.issuedAt + 1 : NaN;
  const validated = validateProofRequest({...request, signature}, checkedAt);
  const currentReceipt = receipt.version === 'trustgate-public-receipt/v2';
  const legacyReceipt = receipt.version === 'trustgate-public-receipt/v1';
  if ((!currentReceipt && !legacyReceipt) ||
      receipt.kind !== 'CONCORDIUM_VERIFIED_AGENT_SNAPSHOT' ||
      receipt.chain !== PROOF_CONTEXT.network ||
      receipt.scope !== 'PUBLIC_READ_ONLY' ||
      validated.ok !== true ||
      receipt.ownerAccount !== PROOF_CONTEXT.owner ||
      receipt.badge !== PROOF_CONTEXT.badge ||
      receipt.tokenId !== 1323 ||
      receipt.requestNonce !== request.nonce ||
      receipt.intent?.service !== request.service ||
      receipt.intent?.amountUsd !== request.amountUsd ||
      receipt.intent?.purpose !== request.purpose) {
    return report('INVALID_RECEIPT_BINDING', {integrity:true});
  }
  // A checksum can be freely recomputed by an attacker. For v0.5 receipts,
  // independently re-run the deterministic policy over the wallet-signed intent.
  const policyPassed = currentReceipt &&
    validatePolicyWitness(receipt.policyWitness, validated.request) &&
    receipt.policyWitness?.decision === 'ALLOW' &&
    receipt.policyWitness?.action === 'RETURN_PUBLIC_EVIDENCE';
  if (currentReceipt && !policyPassed) {
    return report('POLICY_WITNESS_MISMATCH', {integrity:true,requestBinding:true});
  }

  // Never accept a receipt's own "signatureVerified: true" claim as evidence.
  let signed;
  try {
    const accountInfo = await (options.accountLookup || getAccountInfo)(request.account);
    signed = await (options.signatureVerifier || verifyMessageSignature)(
      buildSignedMessage(validated.request), signature, accountInfo
    );
  } catch { return report('ACCOUNT_SIGNATURE_CHECK_UNAVAILABLE', {integrity:true,requestBinding:true}); }
  if (signed !== true) return report('INVALID_OWNER_SIGNATURE', {integrity:true,requestBinding:true});

  let badge;
  try { badge = await (options.badgeVerifier || verifyBadge)(request.badge); }
  catch { badge = {ok:false,code:'REGISTRY_UNAVAILABLE'}; }
  if (!badge?.ok || badge.checks?.status !== 'Active' ||
      badge.checks?.tokenId !== 1323 ||
      badge.checks?.ownerAccount !== PROOF_CONTEXT.owner) {
    return report('CURRENT_AGENT_NOT_VERIFIED', {integrity:true,requestBinding:true,ownerSignature:true});
  }
  if (receipt.cardSha256 !== badge.checks?.cardSha256 ||
      receipt.agentCardUrl !== badge.checks?.agentUri ||
      badge.checks?.hashMatchesOnChain !== true) {
    return report('CURRENT_CARD_MISMATCH', {integrity:true,requestBinding:true,ownerSignature:true,currentRegistry:true});
  }
  return {
    ok:true, code:currentReceipt ? 'SIGNED_REQUEST_POLICY_AND_BADGE_VERIFIED' : 'OWNER_SIGNATURE_AND_CURRENT_BADGE_VERIFIED_LEGACY',
    checks:{integrity:true,requestBinding:true,policyWitness:policyPassed,ownerSignature:true,currentRegistry:true,currentCardMatch:true},
    verifiedAt: new Date().toISOString(),
    registryCheckedAt: badge.checkedAt,
    limitation:currentReceipt ? 'Reproducible policy witness, owner-signed request and current Agent #1323 verified. This is NOT proof of server issuance time, historical immutability, durable replay prevention, or payment.' : 'Legacy receipt: owner signature and current badge verified, but no policy witness available. NOT an attestation of historic policy, issuance time, or payment.',
  };
}
