import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {
  acquireWalletOperation,getActiveWalletOperation,describeWalletPromptError,classifyNativeWalletFailure,
  WALLET_OPERATION_EVENT
} from '../lib/x402-wallet-ui-lock.js';

function fakeDocument(){
  const attrs=new Map(),events=[];
  return {
    events,
    documentElement:{
      getAttribute:key=>attrs.get(key)??null,
      setAttribute:(key,value)=>attrs.set(key,value),
      removeAttribute:key=>attrs.delete(key)
    },
    dispatchEvent(event){events.push(event.type);}
  };
}

test('only one wallet interaction can run across HTTP 402 and native checkout',()=>{
  const doc=fakeDocument();
  const releasePreflight=acquireWalletOperation('preflight',doc);
  assert.equal(typeof releasePreflight,'function');
  assert.equal(getActiveWalletOperation(doc),'preflight');
  assert.equal(acquireWalletOperation('native-payment',doc),null);
  assert.equal(acquireWalletOperation('preflight',doc),null);
  assert.deepEqual(doc.events,[WALLET_OPERATION_EVENT]);
  releasePreflight();
  releasePreflight(); // idempotent
  assert.equal(getActiveWalletOperation(doc),null);
  assert.deepEqual(doc.events,[WALLET_OPERATION_EVENT,WALLET_OPERATION_EVENT]);
  const releaseNative=acquireWalletOperation('native-payment',doc);
  assert.equal(typeof releaseNative,'function');
  assert.equal(acquireWalletOperation('preflight',doc),null);
  releaseNative();
  assert.equal(getActiveWalletOperation(doc),null);
});

test('invalid operation is never admitted and document remains unchanged',()=>{
  const doc=fakeDocument();
  assert.throws(()=>acquireWalletOperation('sign-anything',doc),/INVALID_WALLET_OPERATION/);
  assert.equal(getActiveWalletOperation(doc),null);
  assert.equal(doc.events.length,0);
});

test('existing wallet popup errors explain manual resolution and never retry automatically',()=>{
  for(const msg of ['Another prompt is already open','Request already pending',
    'Wallet is already processing another request']){
    const described=describeWalletPromptError(new Error(msg));
    assert.match(described,/already has an open request/i);
    assert.match(described,/approve or reject/i);
    assert.match(described,/Do not open a second payment/i);
  }
  assert.match(describeWalletPromptError(new Error('User rejected request')),/rejected/i);
  const rejected=describeWalletPromptError(new Error('Signing was rejected'));
  assert.match(rejected,/did not complete the transaction signature/i);
  assert.match(rejected,/no transaction hash/i);
  assert.match(rejected,/no-approval reset/i);
  assert.match(rejected,/check Owner Testnet history/i);
  assert.equal(describeWalletPromptError(new Error('RPC_DOWN')),'RPC_DOWN');
});

test('wallet failure diagnostics are scoped and contain no sensitive raw data',()=>{
  const e=new Error('Value is not an integer: [private-signature-must-not-leak]');
  const r=classifyNativeWalletFailure('wallet transaction approval/submission',e);
  assert.equal(r.code,'WALLET_INTEGER_SERIALIZATION_ERROR');
  assert.match(r.advice,/never approved Sign & Submit/);
  assert.equal(JSON.stringify(r).includes('private-signature-must-not-leak'),false);
  assert.equal(classifyNativeWalletFailure('sponsor transaction preparation',
    new Error('SPONSOR_PREPARE_REPLAY')).code,'SPONSOR_PREPARATION_FAILED');
  assert.equal(classifyNativeWalletFailure('wallet transaction approval/submission',
    new Error('User rejected')).code,'WALLET_APPROVAL_REJECTED');
});

test('both separately bundled browser flows use shared DOM lock and release in finally',async()=>{
  const preflight=await readFile(new URL('../src/x402-preflight.js',import.meta.url),'utf8');
  const payment=await readFile(new URL('../src/x402-sponsored-wallet.js',import.meta.url),'utf8');
  assert.match(preflight,/acquireWalletOperation\('preflight'\)/);
  assert.match(preflight,/release\(\);/);
  assert.match(preflight,/document\.addEventListener\(WALLET_OPERATION_EVENT/);
  assert.match(payment,/acquireWalletOperation\('native-payment'\)/);
  assert.match(payment,/release\(\);/);
  assert.match(payment,/getActiveWalletOperation\(\)/);
  assert.match(payment,/walletSubmissionAttempted=true/);
  assert.match(payment,/transactionHashReceived:false/);
  assert.match(payment,/never clicked Sign & Submit/);
  assert.match(payment,/I did not approve · reset warning/);
  assert.match(payment,/window\.confirm\(question\)/);
});
