import test from 'node:test';
import assert from 'node:assert/strict';
import { attachDigest, digestJson, validateDigest } from '../lib/receipt-format.js';
import { verifyEvidenceReceipt } from '../lib/verify-receipt.js';
import { runLiveProof } from '../lib/live-proof.js';
import { PROOF_CONTEXT, buildSignedMessage } from '../lib/proof-message.js';

const now=Date.UTC(2026,10,20,11,0,0);
const request=()=>({
  badge:PROOF_CONTEXT.badge,account:PROOF_CONTEXT.owner,service:'evidence-oracle',
  amountUsd:'1.00',purpose:'Retrieve a verified Concordium agent snapshot',
  nonce:'ab'.repeat(16),issuedAt:now-1000,signature:{0:{0:'f'.repeat(128)}}
});
const badgeResult=()=>({
  ok:true, checkedAt:'2026-11-20T11:00:05.000Z',
  source:'https://agent-registry-mcp.concordium.com/v1/check-badge/'+PROOF_CONTEXT.badge,
  checks:{
    status:'Active',tokenId:1323,ownerAccount:PROOF_CONTEXT.owner,
    hashMatchesOnChain:true,
    cardSha256:'ed33956577d378ef0bfd537505863d846a2c130513302a2d45d99e5bfc009c44',
    agentUri:'https://trustgate-ai.vercel.app/.well-known/agent-card.json'
  }
});
const deps={
  now,
  accountLookup:async()=>({credentials:'fixture'}),
  signatureVerifier:async()=>true,
  badgeVerifier:async()=>badgeResult()
};
async function fixtureReceipt(){
  const r=await runLiveProof(request(),deps);
  assert.equal(r.decision,'ALLOW');
  return r.receipt;
}
test('canonical SHA-256 digest does not depend on JSON key order',()=>{
  assert.equal(digestJson({a:1,b:{x:2,y:3}}),digestJson({b:{y:3,x:2},a:1}));
  assert.equal(validateDigest(attachDigest({a:1,b:{x:2,y:3}})),true);
  assert.equal(validateDigest({...attachDigest({a:1}),a:2}),false);
});
test('v0.4 receipt contains the signed message and verifies against live owner and registry',async()=>{
  const receipt=await fixtureReceipt();
  assert.equal(receipt.version,'trustgate-public-receipt/v2');
  assert.equal(receipt.policyWitness.decision,'ALLOW');
  assert.equal(receipt.proof.request.nonce,request().nonce);
  assert.equal(receipt.proof.ownerSignature[0][0].length,128);
  const result=await verifyEvidenceReceipt(receipt,deps);
  assert.equal(result.ok,true);
  assert.equal(result.checks.ownerSignature,true);
  assert.equal(result.checks.policyWitness,true);
  assert.equal(result.code,'SIGNED_REQUEST_POLICY_AND_BADGE_VERIFIED');
  assert.equal(result.checks.currentRegistry,true);
});
test('receipt checksum mismatch and tampering fail closed',async()=>{
  const receipt=await fixtureReceipt();
  const invalid=structuredClone(receipt);
  invalid.intent.amountUsd='2.00';
  assert.equal((await verifyEvidenceReceipt(invalid,deps)).code,'RECEIPT_INTEGRITY_MISMATCH');
  const resign=attachDigest({...receipt,intent:{...receipt.intent,amountUsd:'2.00'},digest:undefined});
  assert.equal((await verifyEvidenceReceipt(resign,deps)).ok,false);
});
test('even an attacker-created checksum cannot replace a real signature',async()=>{
  const receipt=await fixtureReceipt();
  const signedMessage=buildSignedMessage(request());
  const opts={...deps,signatureVerifier:async(message)=>message===signedMessage};
  const valid=await verifyEvidenceReceipt(receipt,opts);
  assert.equal(valid.ok,true);
  const badBody={...receipt,proof:{...receipt.proof,request:{...receipt.proof.request,purpose:'Altered trusted request'}}};
  delete badBody.digest;
  const forged=attachDigest(badBody);
  assert.equal((await verifyEvidenceReceipt(forged,opts)).code,'INVALID_RECEIPT_BINDING');
});
test('valid owner signature with revoked, changed, or unavailable registry cannot pass',async()=>{
  const receipt=await fixtureReceipt();
  const bad={
    ...deps,badgeVerifier:async()=>({...badgeResult(),checks:{...badgeResult().checks,ownerAccount:'someone else'}})
  };
  assert.equal((await verifyEvidenceReceipt(receipt,bad)).code,'CURRENT_AGENT_NOT_VERIFIED');
  const changed={
    ...deps,badgeVerifier:async()=>({...badgeResult(),checks:{...badgeResult().checks,cardSha256:'0'.repeat(64)}})
  };
  assert.equal((await verifyEvidenceReceipt(receipt,changed)).code,'CURRENT_CARD_MISMATCH');
  const offline={...deps,accountLookup:async()=>{throw Error('grpc unavailable')}};
  assert.equal((await verifyEvidenceReceipt(receipt,offline)).code,'ACCOUNT_SIGNATURE_CHECK_UNAVAILABLE');
});
test('REVIEW and BLOCK are evaluated only after real signature and registry steps',async()=>{
  for(const amount of ['6.00','12.00']){
    const r=await runLiveProof({...request(),amountUsd:amount},deps);
    assert.equal(r.decision,amount==='6.00'?'REVIEW':'BLOCK');
    assert.equal(r.signatureVerified,true);
    assert.equal(r.identityVerified,true);
    assert.equal(r.evidenceIssued,false);
    assert.equal(r.receipt,null);
    assert.ok(r.reasons.includes('ONCHAIN_BADGE_VERIFIED'));
  }
});
