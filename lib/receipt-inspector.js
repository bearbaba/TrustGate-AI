import { validateDigest } from './receipt-format.js';
import { PROOF_CONTEXT, validateProofRequest } from './proof-message.js';
import { validatePolicyWitness } from './policy-witness.js';

/**
 * Pure structural verification for offline repeatability.
 * This function intentionally DOES NOT verify wallet signatures or live
 * Concordium registry state, and MUST NOT be used to grant access.
 */
export function inspectReceiptOffline(receipt) {
  const shape = receipt !== null && typeof receipt === 'object' && !Array.isArray(receipt);
  if (!shape) {
    return {
      ok:false, code:'INVALID_RECEIPT', mode:'OFFLINE_STRUCTURAL_ONLY',
      checks:{integrity:false,requestBinding:false,policyWitness:false},
      notChecked:['walletSignature','currentRegistry','currentCard','issuerAttestation','durableReplay'],
      warning:'Offline checks cannot authenticate the signer, issuer or current Agent status.'
    };
  }

  const integrity=validateDigest(receipt);
  const request=receipt.proof?.request;
  const signature=receipt.proof?.ownerSignature;
  const contextTime=Number.isSafeInteger(request?.issuedAt) ? request.issuedAt+1 : Number.NaN;
  const checked=validateProofRequest({...request,signature},contextTime);
  const requestBinding=checked.ok === true &&
    receipt.version === 'trustgate-public-receipt/v2' &&
    receipt.kind === 'CONCORDIUM_VERIFIED_AGENT_SNAPSHOT' &&
    receipt.chain === PROOF_CONTEXT.network &&
    receipt.scope === 'PUBLIC_READ_ONLY' &&
    receipt.tokenId === 1323 &&
    receipt.badge === PROOF_CONTEXT.badge &&
    receipt.ownerAccount === PROOF_CONTEXT.owner &&
    receipt.requestNonce === request.nonce &&
    receipt.intent?.service === request.service &&
    receipt.intent?.amountUsd === request.amountUsd &&
    receipt.intent?.purpose === request.purpose;

  const policyWitness=requestBinding &&
    validatePolicyWitness(receipt.policyWitness,checked.request) &&
    receipt.policyWitness?.decision === 'ALLOW' &&
    receipt.policyWitness?.action === 'RETURN_PUBLIC_EVIDENCE';

  const checks={integrity,requestBinding,policyWitness:Boolean(policyWitness)};
  const ok=Object.values(checks).every(x=>x===true);
  return {
    ok,code:ok?'OFFLINE_STRUCTURE_CONSISTENT_NOT_AUTHENTICATED':
      !integrity?'RECEIPT_INTEGRITY_MISMATCH':
      !requestBinding?'INVALID_RECEIPT_BINDING':'POLICY_WITNESS_MISMATCH',
    mode:'OFFLINE_STRUCTURAL_ONLY',checks,
    notChecked:['walletSignature','currentRegistry','currentCard','issuerAttestation','durableReplay'],
    warning:'This check does NOT verify the owner signature, server issuance, current on-chain metadata, payment or replay protection. To verify signature and current registry, rerun with --live.'
  };
}
