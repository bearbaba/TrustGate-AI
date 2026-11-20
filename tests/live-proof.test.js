import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSignedMessage, validateProofRequest, PROOF_CONTEXT } from '../lib/proof-message.js';
import { runLiveProof } from '../lib/live-proof.js';

const now=Date.UTC(2026,10,20,10,50,0);
const make=()=>({
  badge:PROOF_CONTEXT.badge,account:PROOF_CONTEXT.owner,service:'evidence-oracle',
  amountUsd:'1.00',purpose:'Retrieve an on-chain verified agent snapshot',
  nonce:'123456789abcdef0123456789abcdef0',issuedAt:now-1000,
  signature:{0:{0:'a'.repeat(128)}}
});
const verifiedBadge=async (badge)=>({
  ok:true, badge, code:'BADGE_VERIFIED',
  source:'https://agent-registry-mcp.concordium.com/v1/check-badge/'+badge,
  checkedAt:'2026-11-20T10:50:01.000Z',
  checks:{
    status:'Active',tokenId:1323,ownerAccount:PROOF_CONTEXT.owner,
    hashMatchesOnChain:true,cardSha256:'ed33956577d378ef0bfd537505863d846a2c130513302a2d45d99e5bfc009c44',
    agentUri:'https://trustgate-ai.vercel.app/.well-known/agent-card.json'
  }
});
const opts={now,accountLookup:async ()=>({dummy:true}),
  signatureVerifier:()=>true,badgeVerifier:verifiedBadge};
test('signed request is scoped to the origin, testnet and public read-only purpose',()=>{
  const req=make();const msg=buildSignedMessage(req);
  assert.match(msg,/NOT a payment authorization/);
  assert.match(msg,/Domain: https:\/\/trustgate-ai.vercel.app/);
  assert.match(msg,/Network: concordium:testnet/);
  assert.match(msg,/Nonce: 123456789abcdef0123456789abcdef0/);
  assert.deepEqual(validateProofRequest(req,now).ok,true);
});
test('expired, unsupported, malformed and substituted requests fail validation',()=>{
  const req=make();
  assert.equal(validateProofRequest({...req,nonce:'abc'},now).reason,'INVALID_NONCE');
  assert.equal(validateProofRequest({...req,account:'other'},now).reason,'UNSUPPORTED_AGENT_OR_ACCOUNT');
  assert.equal(validateProofRequest({...req,issuedAt:now-90001},now).reason,'REQUEST_EXPIRED');
  assert.equal(validateProofRequest({...req,issuedAt:now+6000},now).reason,'REQUEST_EXPIRED');
  assert.equal(validateProofRequest({...req,purpose:'ok\nForged: yes'},now).reason,'INVALID_PURPOSE');
  assert.equal(validateProofRequest({...req,signature:undefined},now).reason,'INVALID_SIGNATURE_FORMAT');
  assert.equal(validateProofRequest({...req,service:'research-api'},now).reason,'SERVICE_NOT_ALLOWLISTED');
});
test('signed and verified owner receives fresh public evidence receipt (no funds)',async()=>{
  const value=await runLiveProof(make(),opts);
  assert.equal(value.decision,'ALLOW');
  assert.equal(value.evidenceIssued,true);
  assert.equal(value.receipt.ownerAccount,PROOF_CONTEXT.owner);
  assert.equal(value.receipt.signatureVerified,true);
  assert.equal(value.receipt.scope,'PUBLIC_READ_ONLY');
  assert.equal(value.payment,'NOT_EXECUTED');
  assert.match(value.receipt.digest,/^[a-f0-9]{64}$/);
  assert.match(value.auditDigest,/^[a-f0-9]{64}$/);
});
test('owner key verification failure or RPC outage fails closed',async()=>{
  const denied=await runLiveProof(make(),{...opts,signatureVerifier:()=>false});
  assert.equal(denied.decision,'BLOCK');
  assert.deepEqual(denied.reasons,['INVALID_OWNER_SIGNATURE']);
  assert.equal(denied.receipt,null);
  const offline=await runLiveProof(make(),{...opts,accountLookup:async()=>{throw Error('rpc timeout')}});
  assert.deepEqual(offline.reasons,['OWNER_SIGNATURE_VERIFICATION_UNAVAILABLE']);
});
test('revoked badge, mismatch owner, or missing proof cannot issue receipt',async()=>{
  for(const checks of [{status:'Revoked'},{ownerAccount:'someoneelse'},{hashMatchesOnChain:false},{tokenId:999}]){
    const result=await runLiveProof(make(),{
      ...opts,badgeVerifier:async(badge)=>({...await verifiedBadge(badge),checks:{...(await verifiedBadge(badge)).checks,...checks}})
    });
    assert.equal(result.decision,'BLOCK');
    assert.equal(result.evidenceIssued,false);
  }
});
test('review and block policy decisions do not issue evidence',async()=>{
  const review=await runLiveProof({...make(),amountUsd:'6.00'},opts);
  assert.equal(review.decision,'REVIEW');
  assert.equal(review.receipt,null);
  const block=await runLiveProof({...make(),amountUsd:'12.00'},opts);
  assert.equal(block.decision,'BLOCK');
  assert.equal(block.receipt,null);
});
test('the official badge response fixture has a matching owner and card hash',async()=>{
  const snapshot=await verifiedBadge(PROOF_CONTEXT.badge);
  assert.equal(snapshot.checks.ownerAccount,PROOF_CONTEXT.owner);
  assert.equal(snapshot.checks.status,'Active');
  assert.equal(snapshot.checks.tokenId,1323);
});
