import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {connectOwnerWallet} from '../lib/x402-wallet-account.js';
import {PROOF_CONTEXT} from '../lib/proof-message.js';

const owner=PROOF_CONTEXT.owner;
const other='4Q9ZNet1wKBCS3HWYxBSrHjKPfyois52h3gYUUHKe8Fw4Cf3s3';

test('reuses already connected Agent #1323 owner without a connect popup',async()=>{
  let connectCalls=0,selectedCalls=0;
  const wallet={
    async getMostRecentlySelectedAccount(){selectedCalls++;return owner;},
    async connect(){connectCalls++;throw Error('UNEXPECTED_WALLET_POPUP');}
  };
  assert.deepEqual(await connectOwnerWallet(wallet),{account:owner,method:'existing'});
  assert.equal(selectedCalls,1);
  assert.equal(connectCalls,0);
});

test('asks user to connect only if wallet has no existing selected account',async()=>{
  let connectCalls=0;
  const wallet={
    async getMostRecentlySelectedAccount(){return undefined;},
    async connect(){connectCalls++;return owner;}
  };
  assert.deepEqual(await connectOwnerWallet(wallet),{account:owner,method:'new'});
  assert.equal(connectCalls,1);
});

test('supports older Wallet API without selected-account helper',async()=>{
  let calls=0;
  assert.deepEqual(await connectOwnerWallet({connect:async()=>{calls++;return owner;}}),
    {account:owner,method:'new'});
  assert.equal(calls,1);
});

test('wrong connected account is rejected without launching another wallet prompt',async()=>{
  let calls=0;
  const wallet={
    async getMostRecentlySelectedAccount(){return other;},
    async connect(){calls++;return owner;}
  };
  await assert.rejects(()=>connectOwnerWallet(wallet),/WRONG_CONNECTED_ACCOUNT_SELECT_AGENT_1323_OWNER_IN_WALLET/);
  assert.equal(calls,0);
});

test('wallet selection read failure must not start a new extension popup',async()=>{
  let connectCalls=0;
  const wallet={
    async getMostRecentlySelectedAccount(){throw Error('Another prompt is already open');},
    async connect(){connectCalls++;return owner;}
  };
  await assert.rejects(()=>connectOwnerWallet(wallet),/Another prompt is already open/);
  assert.equal(connectCalls,0);
});

test('wrong account after explicit connect is rejected; no trust inferred from prompt approval',async()=>{
  await assert.rejects(()=>connectOwnerWallet({
    getMostRecentlySelectedAccount:async()=>null,
    connect:async()=>other
  }),/WRONG_CONNECTED_ACCOUNT/);
});

test('both x402 flows use selected account and stage-specific reporting',async()=>{
  const p=await readFile(new URL('../src/x402-preflight.js',import.meta.url),'utf8');
  const n=await readFile(new URL('../src/x402-sponsored-wallet.js',import.meta.url),'utf8');
  for(const c of [p,n]){
    assert.match(c,/connectOwnerWallet\(wallet\)/);
    assert.doesNotMatch(c,/const account=await wallet\.connect\(\)/);
    assert.match(c,/stage='wallet owner connection'/);
    assert.match(c,/stage='non-payment message signature'/);
  }
  assert.match(n,/stage='wallet transaction approval\/submission'/);
  assert.match(n,/walletSubmissionAttempted=true/);
});
