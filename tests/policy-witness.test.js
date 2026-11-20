import test from 'node:test';
import assert from 'node:assert/strict';
import { makePolicyWitness, validatePolicyWitness, policyManifestHash } from '../lib/policy-witness.js';
import { attachDigest } from '../lib/receipt-format.js';
import { runLiveProof } from '../lib/live-proof.js';
import { verifyEvidenceReceipt } from '../lib/verify-receipt.js';
import { PROOF_CONTEXT } from '../lib/proof-message.js';

const NOW=Date.UTC(2026,10,20,11,30,0);
const signature = {0:{0:'f'.repeat(128)}};
const request = () => ({
  badge:PROOF_CONTEXT.badge,account:PROOF_CONTEXT.owner,
  service:PROOF_CONTEXT.service,amountUsd:'1.00',
  purpose:'Retrieve a verified Concordium agent snapshot',
  nonce:'5'.repeat(32),issuedAt:NOW-1000,signature
});
const registry=async badge=>({
  ok:true,code:'BADGE_VERIFIED',badge,
  source:'https://agent-registry-mcp.concordium.com/v1/check-badge/'+badge,
  checkedAt:'2026-11-20T11:30:02.000Z',
  checks:{status:'Active',tokenId:1323,ownerAccount:PROOF_CONTEXT.owner,
    cardSha256:'ed33956577d378ef0bfd537505863d846a2c130513302a2d45d99e5bfc009c44',
    agentUri:'https://trustgate-ai.vercel.app/.well-known/agent-card.json',
    hashMatchesOnChain:true}
});
const valid={now:NOW,accountLookup:async()=>({test:true}),
  signatureVerifier:async (_msg,sig)=>sig?.[0]?.[0]==='f'.repeat(128),
  badgeVerifier:registry};
const rehash = value=>{ const {digest,...body}=value;return attachDigest(body); };

test('a policy witness deterministically binds the signed intent and current policy manifest',()=>{
  const item=makePolicyWitness(request());
  assert.equal(item.decision,'ALLOW');
  assert.equal(item.amountCents,100);
  assert.equal(item.manifestHash,policyManifestHash());
  assert.equal(validatePolicyWitness(item,request()),true);
  assert.equal(validatePolicyWitness(item,{...request(),amountUsd:'2.00'}),false);
});
test('the v0.5 receipt is re-evaluated and owner signature plus Concordium badge verified',async()=>{
  const response=await runLiveProof(request(),valid);
  assert.equal(response.receipt.version,'trustgate-public-receipt/v2');
  const verified=await verifyEvidenceReceipt(response.receipt,valid);
  assert.equal(verified.ok,true);
  assert.equal(verified.checks.policyWitness,true);
  assert.equal(verified.code,'SIGNED_REQUEST_POLICY_AND_BADGE_VERIFIED');
});
test('forged policy witness with a fresh SHA-256 is refused',async()=>{
  const response=await runLiveProof(request(),valid);
  const changed=structuredClone(response.receipt);
  changed.policyWitness.decision='BLOCK';
  changed.policyWitness.action='NO_EVIDENCE';
  const result=await verifyEvidenceReceipt(rehash(changed),valid);
  assert.equal(result.ok,false);
  assert.equal(result.code,'POLICY_WITNESS_MISMATCH');
});
test('forged wallet signature with recomputed SHA-256 is refused',async()=>{
  const response=await runLiveProof(request(),valid);
  const changed=structuredClone(response.receipt);
  changed.proof.ownerSignature[0][0]='a'.repeat(128);
  const result=await verifyEvidenceReceipt(rehash(changed),valid);
  assert.equal(result.ok,false);
  assert.equal(result.code,'INVALID_OWNER_SIGNATURE');
});
test('forged anchored card SHA-256 with recomputed receipt SHA-256 is refused',async()=>{
  const response=await runLiveProof(request(),valid);
  const changed=structuredClone(response.receipt);
  changed.cardSha256='0'.repeat(64);
  const result=await verifyEvidenceReceipt(rehash(changed),valid);
  assert.equal(result.ok,false);
  assert.equal(result.code,'CURRENT_CARD_MISMATCH');
});
test('legacy v0.4 owner-signature receipts remain supported but are identified as limited',async()=>{
  const response=await runLiveProof(request(),valid);
  const {digest,policyWitness,...legacyBody}=response.receipt;
  const legacy=attachDigest({...legacyBody,version:'trustgate-public-receipt/v1'});
  const result=await verifyEvidenceReceipt(legacy,valid);
  assert.equal(result.ok,true);
  assert.equal(result.checks.policyWitness,false);
  assert.equal(result.code,'OWNER_SIGNATURE_AND_CURRENT_BADGE_VERIFIED_LEGACY');
});
