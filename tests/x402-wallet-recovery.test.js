import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {
  LAST_NATIVE_TX_KEY,LAST_NATIVE_UNCERTAIN_SUBMISSION_KEY,normalizeNativeTransactionHash,
  shouldHoldNativeCheckout,buildNativeInspectionRecord
} from '../lib/x402-wallet-recovery.js';

const hash='ABCDEF0123456789'.repeat(4);
const normalized=hash.toLowerCase();
test('native hash recovery accepts only an exact public 64-hex tx hash',()=>{
  assert.equal(normalizeNativeTransactionHash(hash),normalized);
  assert.equal(normalizeNativeTransactionHash('  '+hash+' \n'),normalized);
  for(const value of [null,undefined,{},[],true,0,'','0x'+hash,
    'a'.repeat(63),'a'.repeat(65),hash+';DROP',' ', 'z'.repeat(64)])
    assert.equal(normalizeNativeTransactionHash(value),null);
});

test('previous submitted transaction blocks a blind second signature until independently verified',()=>{
  assert.equal(shouldHoldNativeCheckout(hash,false),true);
  assert.equal(shouldHoldNativeCheckout(hash,null),true);
  assert.equal(shouldHoldNativeCheckout(hash,'true'),true);
  assert.equal(shouldHoldNativeCheckout(hash,true),false);
  assert.equal(shouldHoldNativeCheckout('bad-hash',false),false);
  assert.equal(shouldHoldNativeCheckout(null,false,true),true);
  assert.equal(shouldHoldNativeCheckout(null,true,true),true);
  assert.equal(shouldHoldNativeCheckout(hash,true,true),true);
  assert.equal(shouldHoldNativeCheckout(null,false,'true'),false);
});

test('public chain inspection is never an x402 paid entitlement or server attestation',()=>{
  const response={
    network:'ccd:4221332d34e1694168c2a0c0b3fd0f27',
    transaction:hash,merchant:'merchant-public',sponsor:'sponsor-public',
    amountMicroCcd:'100000',verified:true,
    code:'ONCHAIN_FINALIZED_EXACT_CCD_TRANSFER_VERIFIED',
    grantsPaidResource:true,
    secret:'NEVER_COPY_PRIVATE_API_VALUES'
  };
  const record=buildNativeInspectionRecord(response,'2026-11-22T03:00:00.000Z');
  assert.equal(record.transaction,normalized);
  assert.equal(record.verified,true);
  assert.equal(record.grantsPaidResource,false);
  assert.equal(record.serverAttested,false);
  assert.equal(record.x402ExactSettlement,false);
  assert.equal(record.browserCheckedAt,'2026-11-22T03:00:00.000Z');
  assert.equal(JSON.stringify(record).includes('NEVER_COPY_PRIVATE_API_VALUES'),false);
  assert.match(record.warning,/does not bind/);
});

test('pending, failed, or malformed on-chain results cannot become positive proof',()=>{
  const base={transaction:hash,network:'ccd:test',code:'ONCHAIN_SETTLEMENT_NOT_FINALIZED'};
  assert.equal(buildNativeInspectionRecord({...base,verified:false},new Date().toISOString()).verified,false);
  assert.equal(buildNativeInspectionRecord({...base,verified:null},new Date().toISOString()).verified,false);
  assert.equal(buildNativeInspectionRecord({...base,verified:1},new Date().toISOString()).verified,false);
  assert.throws(()=>buildNativeInspectionRecord({...base,transaction:'invalid'},new Date().toISOString()));
  assert.throws(()=>buildNativeInspectionRecord(base,'not-a-date'));
});

test('browser offers hash verification while checkout is locked, and saves public hash only',async()=>{
  const html=await readFile(new URL('../public/x402-gateway.html',import.meta.url),'utf8');
  const client=await readFile(new URL('../src/x402-sponsored-wallet.js',import.meta.url),'utf8');
  assert.match(html,/id="sponsoredHash"/);
  assert.match(html,/id="sponsoredForget"/);
  assert.match(html,/id="sponsoredOwnerHistory"/);
  assert.match(html,/ccdexplorer\.io\/testnet\/account\/34C1ozW8edKtBmA8FUFoR4aBys8ofuwtRmYqqbzNVPAsATT4wk/);
  assert.match(html,/a non-secret unresolved-submission flag/);
  assert.match(html,/One owner-approved official sender-first/);
  assert.match(html,/The browser-wallet native sponsored checkout is a separate workflow and remains unverified/);
  assert.match(html,/0ac313bf373f1ba409ee2ba1519be5304bf108d540d4cee6adaf3678037367de/);
  assert.match(html,/id="sponsoredDownload"[^>]*disabled/);
  assert.match(html,/id="sponsoredInspect"[^>]*disabled/);
  assert.match(client,/sessionStorage\.setItem\(LAST_NATIVE_TX_KEY,normalized\)/);
  assert.match(client,/sessionStorage\.getItem\(LAST_NATIVE_TX_KEY\)/);
  assert.match(client,/sessionStorage\.removeItem\(LAST_NATIVE_TX_KEY\)/);
  assert.match(client,/shouldHoldNativeCheckout\(submittedHash,submittedVerified,uncertainSubmission\)/);
  assert.match(client,/getJson\('\/api\/x402\/resource\?mode=browser-inspect&hash='/);
  assert.match(client,/if\(normalizeNativeTransactionHash\(proof\.transaction\)!==hash\)/);
  assert.match(client,/buildNativeInspectionRecord\(proof,new Date\(\)\.toISOString\(\)\)/);
  assert.match(client,/downloadButton\.disabled=!lastInspection/);
  assert.match(client,/link\.download='trustgate-native-chain-inspection-'/);
  assert.match(client,/lastInspection=inspection\.verified\?inspection:null/);
  assert.match(LAST_NATIVE_TX_KEY,/^trustgate:native-testnet/);
  assert.match(LAST_NATIVE_UNCERTAIN_SUBMISSION_KEY,/^trustgate:native-testnet/);
  assert.match(client,/sessionStorage\.setItem\(LAST_NATIVE_UNCERTAIN_SUBMISSION_KEY,'1'\)/);
  assert.match(client,/sessionStorage\.getItem\(LAST_NATIVE_UNCERTAIN_SUBMISSION_KEY\)/);
  assert.match(client,/sessionStorage\.removeItem\(LAST_NATIVE_UNCERTAIN_SUBMISSION_KEY\)/);
  assert.match(client,/uncertainSubmission=true/);
  assert.match(client,/forgetButton\.disabled=!submittedHash && !uncertainSubmission/);
  const markedAt=client.indexOf("sessionStorage.setItem(LAST_NATIVE_UNCERTAIN_SUBMISSION_KEY,'1')");
  const submitAt=client.indexOf('await wallet.sendSponsoredTransaction(account,tx)');
  assert.ok(markedAt>0 && markedAt<submitAt,
    'mark unresolved locally BEFORE any wallet submission');
});

