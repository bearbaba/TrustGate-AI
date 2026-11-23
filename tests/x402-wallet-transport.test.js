import test from 'node:test';
import assert from 'node:assert/strict';
import {SequenceNumber} from '@concordium/web-sdk';
import {Transaction} from '@concordium/web-sdk/transactions';
import {prepareSponsoredCcdTransaction} from '../lib/x402-browser-sponsored.js';
import {PROOF_CONTEXT} from '../lib/proof-message.js';
import {X402_TESTNET} from '../lib/x402-config.js';
import {inspectSponsoredWalletWire,inspectSponsoredWalletJsonTypes}
  from '../lib/x402-wallet-transport.js';

const signerConfig={
  merchant:'4XYepvZZJyFkKTTgoTCmNuQYar1PBiscdZBh6cRotsG2Y7SBDf',
  address:'4Q9ZNet1wKBCS3HWYxBSrHjKPfyois52h3gYUUHKe8Fw4Cf3s3',
  network:X402_TESTNET,
  // RFC8032 published test seed; NEVER a production account key.
  privateKey:'9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60'
};
const fetchNonce=async()=>SequenceNumber.create(1n);

test('exact wallet 2.x JSON transport preserves typed integer fields',async()=>{
  const prepared=await prepareSponsoredCcdTransaction(signerConfig,{account:PROOF_CONTEXT.owner},{
    fetchNonce,nowMs:Date.UTC(2026,10,23,1,45,0)
  });
  const signable=Transaction.signableFromJSON(prepared);
  const roundtrip=inspectSponsoredWalletWire(signable);
  assert.deepEqual(roundtrip,{
    ok:true,code:'WALLET_SIGNABLE_ROUNDTRIP_OK',
    versionType:'number',executionEnergyAmountType:'bigint'
  });
});

test('emulate SDK integer errors caused by malformed wallet wire types',async()=>{
  const prepared=await prepareSponsoredCcdTransaction(signerConfig,{account:PROOF_CONTEXT.owner},{
    fetchNonce
  });
  assert.equal(inspectSponsoredWalletJsonTypes({
    ...prepared,version:'1'
  }).code,'WALLET_SIGNABLE_INTEGER_FIELD_INVALID');
  assert.equal(inspectSponsoredWalletJsonTypes({
    ...prepared,header:{...prepared.header,executionEnergyAmount:'0'}
  }).code,'WALLET_SIGNABLE_INTEGER_FIELD_INVALID');
  const wrongEnergy=inspectSponsoredWalletJsonTypes({
    ...prepared,header:{...prepared.header,executionEnergyAmount:NaN}
  });
  assert.equal(wrongEnergy.ok,false);
  assert.equal(wrongEnergy.code,'WALLET_SIGNABLE_INTEGER_FIELD_INVALID');
});

test('diagnostic never echoes signature, private key, merchant or full transaction',async()=>{
  const prepared=await prepareSponsoredCcdTransaction(signerConfig,{account:PROOF_CONTEXT.owner},{
    fetchNonce
  });
  const output=JSON.stringify(inspectSponsoredWalletJsonTypes(prepared));
  assert.equal(output.includes(signerConfig.privateKey),false);
  assert.equal(output.includes(signerConfig.merchant),false);
  assert.equal(output.includes(JSON.stringify(prepared.signatures)),false);
  assert.equal(output.includes('payload'),false);
  assert.equal(output.includes('amount'),false);
});
