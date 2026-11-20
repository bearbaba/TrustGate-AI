import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { inspectReceiptOffline } from '../lib/receipt-inspector.js';
import { attachDigest } from '../lib/receipt-format.js';
import { runLiveProof } from '../lib/live-proof.js';
import { PROOF_CONTEXT } from '../lib/proof-message.js';

const NOW=Date.UTC(2026,10,20,11,56,0);
async function makeReceipt() {
  const request={
    badge:PROOF_CONTEXT.badge,account:PROOF_CONTEXT.owner,service:PROOF_CONTEXT.service,
    amountUsd:'1.00',purpose:'Retrieve a verified Concordium agent snapshot',
    issuedAt:NOW-1000,nonce:'a'.repeat(32),signature:{0:{0:'0'.repeat(128)}}
  };
  const result=await runLiveProof(request,{
    now:NOW,accountLookup:async()=>({fixture:true}),signatureVerifier:async()=>true,
    badgeVerifier:async()=>({ok:true,source:'https://agent-registry-mcp.concordium.com/v1/check-badge/'+PROOF_CONTEXT.badge,
      checkedAt:'2026-11-20T11:56:00.000Z',
      checks:{status:'Active',tokenId:1323,ownerAccount:PROOF_CONTEXT.owner,hashMatchesOnChain:true,
        agentUri:'https://trustgate-ai.vercel.app/.well-known/agent-card.json',
        cardSha256:'ed33956577d378ef0bfd537505863d846a2c130513302a2d45d99e5bfc009c44'}})
  });
  assert.equal(result.decision,'ALLOW');
  return result;
}

test('offline CLI checks consistent SHA-256 and deterministic policy without pretending signature is valid',async()=>{
  const value=await makeReceipt();
  const report=inspectReceiptOffline(value.receipt);
  assert.equal(report.ok,true);
  assert.equal(report.code,'OFFLINE_STRUCTURE_CONSISTENT_NOT_AUTHENTICATED');
  assert.equal(report.checks.policyWitness,true);
  assert.ok(report.notChecked.includes('walletSignature'));
  assert.ok(report.notChecked.includes('issuerAttestation'));
});
test('offline structural audit rejects forged policy witness even with a new SHA-256',async()=>{
  const value=await makeReceipt();
  const altered=structuredClone(value.receipt);
  altered.policyWitness.decision='BLOCK';
  altered.policyWitness.action='NO_EVIDENCE';
  const {digest,...body}=altered;
  assert.equal(inspectReceiptOffline(attachDigest(body)).code,'POLICY_WITNESS_MISMATCH');
});
test('offline structural audit detects inconsistent request binding',async()=>{
  const value=await makeReceipt();
  const altered=structuredClone(value.receipt);
  altered.intent.amountUsd='7.00';
  const {digest,...body}=altered;
  assert.equal(inspectReceiptOffline(attachDigest(body)).code,'INVALID_RECEIPT_BINDING');
});
test('offline mode intentionally cannot authenticate a forged wallet signature',async()=>{
  const value=await makeReceipt();
  const altered=structuredClone(value.receipt);
  altered.proof.ownerSignature[0][0]='f'.repeat(128);
  const {digest,...body}=altered;
  const report=inspectReceiptOffline(attachDigest(body));
  assert.equal(report.ok,true);
  assert.equal(report.mode,'OFFLINE_STRUCTURAL_ONLY');
  assert.ok(report.warning.includes('DOES NOT verify'));
});
test('independent CLI offline run reports warnings, and exits nonzero on a tampered receipt',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'trustgate-verifier-'));
  try {
    const receipt=await makeReceipt();
    const file=join(dir,'receipt.json');
    await writeFile(file,JSON.stringify(receipt));
    const cmd=join(process.cwd(),'scripts','verify-receipt.mjs');
    const valid=spawnSync(process.execPath,[cmd,file,'--offline'],{encoding:'utf8',timeout:10000});
    assert.equal(valid.status,0,valid.stderr);
    const report=JSON.parse(valid.stdout);
    assert.equal(report.mode,'OFFLINE');
    assert.equal(report.ok,true);
    assert.equal(report.code,'OFFLINE_STRUCTURE_CONSISTENT_NOT_AUTHENTICATED');

    const wrong={...receipt,receipt:{...receipt.receipt,digest:'0'.repeat(64)}};
    await writeFile(file,JSON.stringify(wrong));
    const invalid=spawnSync(process.execPath,[cmd,file,'--offline'],{encoding:'utf8',timeout:10000});
    assert.equal(invalid.status,2,invalid.stderr);
    assert.equal(JSON.parse(invalid.stdout).code,'RECEIPT_INTEGRITY_MISMATCH');
  } finally {
    await rm(dir,{recursive:true,force:true});
  }
});
