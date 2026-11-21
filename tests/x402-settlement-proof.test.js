import test from 'node:test';
import assert from 'node:assert/strict';
import { AccountAddress, CcdAmount, TransactionHash } from '@concordium/web-sdk';
import {
  assessFinalizedCcdTransfer,verifyFinalizedConcordiumPayment
} from '../lib/x402-settlement-proof.js';
import { PROOF_CONTEXT } from '../lib/proof-message.js';

const merchant='4XYepvZZJyFkKTTgoTCmNuQYar1PBiscdZBh6cRotsG2Y7SBDf';
const sponsor='4Q9ZNet1wKBCS3HWYxBSrHjKPfyois52h3gYUUHKe8Fw4Cf3s3';
const tx='b'.repeat(64);
const expected={transaction:tx,merchant,amountMicroCcd:'100000',sponsor};
const requirements={
  scheme:'exact',asset:'CCD',payTo:merchant,amount:'100000',extra:{feePayer:sponsor}
};
const address=value=>AccountAddress.fromBase58(value);
const finalized=()=>({
  status:'finalized',
  outcome:{
    blockHash:{toString:()=> 'a'.repeat(64)},
    summary:{
      hash:TransactionHash.fromHexString(tx),
      type:'accountTransaction',
      transactionType:'transfer',
      sender:address(PROOF_CONTEXT.owner),
      transfer:{to:address(merchant),amount:CcdAmount.fromMicroCcd(100000n)},
      sponsor:{sponsor:address(sponsor),cost:CcdAmount.fromMicroCcd(1000n)}
    }
  }
});

test('native exact sponsored CCD transfer is independently confirmed against finalized summary',()=>{
  assert.deepEqual(assessFinalizedCcdTransfer(finalized(),expected),{
    ok:true,code:'ONCHAIN_FINALIZED_EXACT_CCD_TRANSFER_VERIFIED'
  });
});

test('pending, committed, absent, failed or unrelated transactions never unlock access',()=>{
  for(const status of [
    {status:'received'},
    {status:'committed',outcomes:[finalized().outcome]},
    {status:'finalized',outcome:{summary:null}},
    {...finalized(),outcome:{summary:{...finalized().outcome.summary,
      transactionType:'failed'}}},
    {...finalized(),outcome:{summary:{...finalized().outcome.summary,
      transactionType:'transferWithMemo'}}},
    {...finalized(),outcome:{summary:{...finalized().outcome.summary,
      type:'accountCreation'}}}
  ]) assert.equal(assessFinalizedCcdTransfer(status,expected).ok,false);
});

test('payment scope must bind tx hash, sender, Merchant, Sponsor and amount',()=>{
  const attempts=[
    {summary:{hash:TransactionHash.fromHexString('e'.repeat(64))}},
    {summary:{sender:address(merchant)}},
    {summary:{transfer:{to:address(PROOF_CONTEXT.owner),amount:CcdAmount.fromMicroCcd(100000n)}}},
    {summary:{transfer:{to:address(merchant),amount:CcdAmount.fromMicroCcd(99999n)}}},
    {summary:{sponsor:{sponsor:address(merchant)}}},
    {summary:{sponsor:undefined}},
    {summary:{transfer:{to:address(merchant),amount:undefined}}}
  ];
  for(const change of attempts){
    const state=finalized();
    Object.assign(state.outcome.summary,change.summary);
    assert.equal(assessFinalizedCcdTransfer(state,expected).ok,false);
  }
});

test('read-only Testnet RPC result is required; failure or invalid scope fails closed',async()=>{
  let calls=0;
  const found=await verifyFinalizedConcordiumPayment(tx,requirements,{
    lookup:async(hash,network)=>{
      calls++;
      assert.equal(hash,tx);
      assert.match(network,/^ccd:/);
      return finalized();
    }
  });
  assert.equal(found.ok,true);
  assert.equal(calls,1);
  const unreachable=await verifyFinalizedConcordiumPayment(tx,requirements,{
    lookup:async()=>{throw Error('RPC_NODE_UNAVAILABLE');}
  });
  assert.equal(unreachable.code,'ONCHAIN_SETTLEMENT_LOOKUP_UNAVAILABLE');
  const bad=await verifyFinalizedConcordiumPayment('invalid',requirements,{
    lookup:async()=>{throw Error('SHOULD_NOT_QUERY');}
  });
  assert.equal(bad.code,'INVALID_ONCHAIN_PAYMENT_SCOPE');
  const outOfScope=await verifyFinalizedConcordiumPayment(tx,{...requirements,amount:'nope'},{
    lookup:async()=>{throw Error('SHOULD_NOT_QUERY');}
  });
  assert.equal(outOfScope.code,'INVALID_ONCHAIN_PAYMENT_SCOPE');
});
