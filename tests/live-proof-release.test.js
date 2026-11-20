import test from 'node:test';
import assert from 'node:assert/strict';
import { runLiveProof } from '../lib/live-proof.js';
import { PROOF_CONTEXT } from '../lib/proof-message.js';

const NOW = Date.UTC(2026,10,20,11,20,0);
const request = (amountUsd='1.00') => ({
  badge: PROOF_CONTEXT.badge, account: PROOF_CONTEXT.owner,
  service: PROOF_CONTEXT.service, amountUsd,
  purpose: 'Retrieve a verified agent snapshot',
  nonce: '9'.repeat(32), issuedAt:NOW-1000,
  signature: {0:{0:'a'.repeat(128)}}
});
const validBadge = () => ({
  ok:true,checkedAt:'2026-11-20T11:20:00.000Z',
  source:'https://agent-registry-mcp.concordium.com/v1/check-badge/'+PROOF_CONTEXT.badge,
  checks:{status:'Active',tokenId:1323,ownerAccount:PROOF_CONTEXT.owner,
    hashMatchesOnChain:true,cardSha256:'ed33956577d378ef0bfd537505863d846a2c130513302a2d45d99e5bfc009c44',
    agentUri:'https://trustgate-ai.vercel.app/.well-known/agent-card.json'}
});
const options={now:NOW,accountLookup:async()=>({publicKeys:'fixture'}),
 signatureVerifier:async()=>true,badgeVerifier:async()=>validBadge()};
test('review request does not bypass a bad owner signature', async()=>{
  const r=await runLiveProof(request('6.00'),{...options,signatureVerifier:async()=>false});
  assert.equal(r.decision,'BLOCK');
  assert.deepEqual(r.reasons,['INVALID_OWNER_SIGNATURE']);
  assert.equal(r.receipt,null);
  assert.equal(r.evidenceIssued,false);
});
test('block request does not accidentally skip owner and registry checks',async()=>{
  const r=await runLiveProof(request('12.00'),{...options,badgeVerifier:async()=>({ok:false,code:'REVOKED'})});
  assert.equal(r.decision,'BLOCK');
  assert.equal(r.receipt,null);
  assert.equal(r.evidenceIssued,false);
  assert.ok(r.reasons.includes('REVOKED'));
});
test('an expired signed request never reaches the wallet lookup or badge registry',async()=>{
  let calls=0;
  const r=await runLiveProof({...request(),issuedAt:NOW-90001},{
    ...options,accountLookup:async()=>{calls++;throw Error('must not run');},
    badgeVerifier:async()=>{calls++;throw Error('must not run');}
  });
  assert.equal(r.decision,'BLOCK');
  assert.deepEqual(r.reasons,['REQUEST_EXPIRED']);
  assert.equal(r.receipt,null);
  assert.equal(calls,0);
});
test('ALLOW receipt binds nonce and service, never includes a payment transaction',async()=>{
  const result=await runLiveProof(request('1.00'),options);
  assert.equal(result.decision,'ALLOW');
  assert.equal(result.payment,'NOT_EXECUTED');
  assert.equal(result.receipt.requestNonce,request().nonce);
  assert.equal(result.receipt.proof.request.service,PROOF_CONTEXT.service);
  assert.equal(result.receipt.proof.request.amountUsd,'1.00');
  assert.equal(result.receipt.scope,'PUBLIC_READ_ONLY');
  assert.equal('transactionHash' in result.receipt,false);
});
