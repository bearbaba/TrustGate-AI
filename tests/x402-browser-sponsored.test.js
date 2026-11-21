import test from 'node:test';
import {readdir} from 'node:fs/promises';
import resourceHandler from '../api/x402/resource.js';
import assert from 'node:assert/strict';
import {CcdAmount,SequenceNumber} from '@concordium/web-sdk';
import {handleBrowserSponsoredPrepare,prepareSponsoredCcdTransaction}
  from '../lib/x402-browser-sponsored.js';
import {handleBrowserSponsoredInspect} from '../lib/x402-browser-inspect.js';
import {PROOF_CONTEXT} from '../lib/proof-message.js';
import {X402_TESTNET} from '../lib/x402-config.js';

const merchant='4XYepvZZJyFkKTTgoTCmNuQYar1PBiscdZBh6cRotsG2Y7SBDf';
const sponsor='4Q9ZNet1wKBCS3HWYxBSrHjKPfyois52h3gYUUHKe8Fw4Cf3s3';
const seed='9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60';
const gateway={configured:true,merchant,amountMicroCcd:'100000',network:X402_TESTNET};
const sponsorConfig={configured:true,merchant,address:sponsor,
  network:X402_TESTNET,privateKey:seed,redisToken:'DO_NOT_LEAK'};
const intent={account:PROOF_CONTEXT.owner,nonce:'a'.repeat(32),issuedAt:Date.now(),
  badge:PROOF_CONTEXT.badge,network:X402_TESTNET,resource:'/api/x402/resource',
  payTo:merchant,asset:'CCD',amountMicroCcd:'100000'};
const funded={status:'ACCOUNTS_PRESENT_SPONSOR_HAS_CCD',merchantExists:true,
  sponsorExists:true,sponsorHasAvailableCcd:true};
const fakePayment={version:1,header:{sender:PROOF_CONTEXT.owner,
  sponsor:{account:sponsor}},signatures:{sponsor:{0:{0:'abc'}}}};
const fakeRes=()=>{const state={statusCode:null,body:null,headers:{}};return{
  state,setHeader(k,v){state.headers[k]=v;},
  status(code){state.statusCode=code;return{json(data){state.body=data;return state;}}}
}};
const deps={
  gatewayConfig:gateway,sponsorConfig,
  verifyIntent:async()=>({ok:true,intent}),
  inspectAccounts:async()=>funded,
  inspectSigningAuthority:async()=>({ok:true}),
  lookupOwner:async()=>({accountAvailableBalance:CcdAmount.fromMicroCcd(200000n)}),
  rateLimit:async()=>true,
  reserve:async()=>({ok:true,keys:{intentKey:'k1',paymentKey:'k2'}}),
  prepare:async()=>fakePayment
};
const request={method:'POST',headers:{'content-type':'application/json'},body:{
  intent:{...intent,signature:{0:{0:'test-only'}}}}};
async function prepare(options={},req=request){
  const r=fakeRes();await handleBrowserSponsoredPrepare(req,r,{...deps,...options});
  return r.state;
}

test('checkout remains locked without full Sponsor+gateway prerequisites, no signer invoked',async()=>{
  let calls=0;
  const r=await prepare({gatewayConfig:{...gateway,configured:false},
    prepare:async()=>{calls++;return fakePayment;}});
  assert.equal(r.statusCode,503);
  assert.equal(r.body.error,'WALLET_SPONSORED_CHECKOUT_LOCKED');
  assert.equal(calls,0);
});

test('bad message signature, revoked badge or wrong owner is rejected before Sponsor signing',async()=>{
  let calls=0;
  for(const code of ['INVALID_OWNER_SIGNATURE','AGENT_BADGE_NOT_VERIFIED','WRONG_AGENT_OWNER']){
    const r=await prepare({verifyIntent:async()=>({ok:false,code}),
      prepare:async()=>{calls++;return fakePayment;}});
    assert.equal(r.statusCode,403);
    assert.equal(r.body.error,code);
  }
  assert.equal(calls,0);
});

test('Sponsor not funded/key unauthorized or payer has insufficient CCD fails closed',async()=>{
  let calls=0;
  for(const override of [
    {inspectAccounts:async()=>({...funded,sponsorHasAvailableCcd:false})},
    {inspectSigningAuthority:async()=>({ok:false})},
    {lookupOwner:async()=>{throw Error('RPC_DOWN');}}
  ]){
    const r=await prepare({...override,prepare:async()=>{calls++;return fakePayment;}});
    assert.equal(r.statusCode,503);
  }
  const broke=await prepare({lookupOwner:async()=>({
    accountAvailableBalance:CcdAmount.fromMicroCcd(90000n)})});
  assert.equal(broke.statusCode,409);
  assert.equal(broke.body.error,'OWNER_TESTNET_CCD_INSUFFICIENT');
  assert.equal(calls,0);
});

test('global sponsor quota and Redis reservation guard pre-signing against replay',async()=>{
  let signing=0;
  for(const override of [
    {rateLimit:async()=>false},
    {rateLimit:async()=>{throw Error('redis unavailable')}},
    {reserve:async()=>({ok:false})},
    {reserve:async()=>{throw Error('EVAL unsupported')}}
  ]){
    const r=await prepare({...override,
      prepare:async()=>{signing++;return fakePayment;}});
    assert.ok([409,429,503].includes(r.statusCode));
  }
  assert.equal(signing,0);
});

test('only a bound Sponsor-signed transfer is returned; never a private key or paid entitlement',async()=>{
  let calls=0;let payload;
  const r=await prepare({
    reserve:async(_config,actual,marker)=>{
      assert.equal(actual.nonce,intent.nonce);
      assert.equal(marker.owner,PROOF_CONTEXT.owner);
      assert.equal(marker.merchant,merchant);
      assert.equal(marker.sponsor,sponsor);
      return {ok:true};
    },
    prepare:async(c,i)=>{calls++;payload=[c,i];return fakePayment;}
  });
  assert.equal(r.statusCode,200);
  assert.equal(r.body.kind,'NATIVE_WALLET_SPONSORED_PREPARED_V1');
  assert.equal(r.body.amountMicroCcd,'100000');
  assert.equal(r.body.network,X402_TESTNET);
  assert.equal(r.body.sponsoredTransaction,fakePayment);
  assert.equal(calls,1);
  assert.equal(payload[0].address,sponsor);
  assert.equal(JSON.stringify(r.body).includes(seed),false);
  assert.equal(JSON.stringify(r.body).includes('DO_NOT_LEAK'),false);
  assert.equal(r.body.grantsPaidResource,undefined);
});

test('Sponsor signing failure remains locked and does not masquerade as approval',async()=>{
  const r=await prepare({prepare:async()=>{throw Error('bad signing key');}});
  assert.equal(r.statusCode,503);
  assert.equal(r.body.error,'SPONSORED_TRANSACTION_PREPARATION_FAILED');
  assert.equal(r.body.manualReconciliationRequired,true);
});

test('SDK sponsor-first builder creates authentic V1 transaction with fixed CCD target',async()=>{
  const tx=await prepareSponsoredCcdTransaction(sponsorConfig,intent,{
    fetchNonce:async()=>SequenceNumber.create(1n)
  });
  assert.equal(tx.version,1);
  assert.equal(tx.header.sender,PROOF_CONTEXT.owner);
  assert.equal(tx.header.sponsor.address??tx.header.sponsor.account,sponsor);
  assert.ok(tx.signatures?.sponsor);
});

test('browser inspection only reports public finalized scope; no paid access',async()=>{
  const hash='b'.repeat(64);
  let calls=0;
  const r=fakeRes();
  await handleBrowserSponsoredInspect({method:'GET',query:{hash}},r,{
    gatewayConfig:gateway,sponsorConfig,
    rateLimit:async()=>true,
    verifyPayment:async(_tx,requirements)=>{
      calls++;assert.equal(requirements.payTo,merchant);
      assert.equal(requirements.extra.feePayer,sponsor);
      return {ok:true,code:'ONCHAIN_FINALIZED_EXACT_CCD_TRANSFER_VERIFIED'};
    }
  });
  assert.equal(r.state.statusCode,200);
  assert.equal(r.state.body.verified,true);
  assert.equal(r.state.body.grantsPaidResource,false);
  assert.equal(calls,1);
  const invalid=fakeRes();
  await handleBrowserSponsoredInspect({method:'GET',query:{hash:'abc'}},invalid,{});
  assert.equal(invalid.state.statusCode,400);
});

test('inspection RPC errors remain unverified',async()=>{
  const r=fakeRes();
  await handleBrowserSponsoredInspect({method:'GET',query:{hash:'b'.repeat(64)}},r,{
    gatewayConfig:gateway,sponsorConfig,
    rateLimit:async()=>true,
    verifyPayment:async()=>{throw Error('RPC_UNAVAILABLE');}
  });
  assert.equal(r.state.statusCode,200);
  assert.equal(r.state.body.verified,false);
  assert.equal(r.state.body.code,'ONCHAIN_SETTLEMENT_LOOKUP_UNAVAILABLE');
});

test('single Vercel Hobby API function multiplexes native prep/inspect without unguarded fallthrough',async()=>{
  async function walk(path) {
    const dir=await readdir(new URL(path,import.meta.url),{withFileTypes:true});
    let n=0;
    for(const e of dir){
      if(e.isFile()&&e.name.endsWith('.js'))n++;
      else if(e.isDirectory())n+=await walk(path+e.name+'/');
    }
    return n;
  }
  const n=await walk('../api/');
  assert.equal(n,12,'Hobby plan permits at most 12 deployed Serverless Functions');
  const prep=fakeRes();
  await resourceHandler({method:'GET',query:{mode:'browser-prepare'},headers:{}},prep);
  assert.equal(prep.state.statusCode,405);
  assert.equal(prep.state.body.error,'METHOD_NOT_ALLOWED');
  const invalid=fakeRes();
  await resourceHandler({method:'GET',query:{mode:'browser-inspect',hash:'nope'},headers:{}},invalid);
  assert.equal(invalid.state.statusCode,400);
  assert.equal(invalid.state.body.error,'INVALID_TRANSACTION_HASH');
  const unchanged=fakeRes();
  await resourceHandler({method:'GET',query:{},headers:{}},unchanged);
  assert.equal(unchanged.state.statusCode,503);
  assert.equal(unchanged.state.body.status,'LOCKED_UNTIL_CONFIGURED');
});
