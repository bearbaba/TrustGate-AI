import test from 'node:test';
import assert from 'node:assert/strict';
import { CcdAmount } from '@concordium/web-sdk';
import { assessSponsorAccounts, inspectSponsorAccounts, sponsorCanProceed } from '../lib/x402-chain-readiness.js';
import { handleSponsor, makeTrustGateFacilitator } from '../lib/x402-facilitator.js';
import accountRoute from '../api/sponsor/accounts.js';

const merchant='4XYepvZZJyFkKTTgoTCmNuQYar1PBiscdZBh6cRotsG2Y7SBDf';
const sponsor='4Q9ZNet1wKBCS3HWYxBSrHjKPfyois52h3gYUUHKe8Fw4Cf3s3';
const conf={configured:false,merchant,address:sponsor,network:'ccd:4221332d34e1694168c2a0c0b3fd0f27',
  redisUrl:'https://test.upstash.io',redisToken:'test-token',privateKey:'SENSITIVE',token:'SENSITIVE'};
const info=(balance=0n)=>({
  accountAddress:{address:merchant},
  accountAvailableBalance:CcdAmount.fromMicroCcd(balance)
});
function fakeRes(){
  const r={statusCode:0,data:null,headers:{}};
  return {out:r,setHeader(k,v){r.headers[k]=v;},
    status(code){r.statusCode=code;return{json(data){r.data=data;return r;}}}};
}
async function callRoute(config=conf,opts={},method='GET'){
  const res=fakeRes();
  await handleSponsor({method,headers:{}},res,{path:'/api/sponsor/accounts',config,
    rateLimit:async()=>true,
    inspectAccounts:async()=>inspectSponsorAccounts(config,{
      accountLookup:async address=> info(address===sponsor?1000000n:0n)
    }),...opts});
  return res.out;
}

test('Sponsor account presence and available Testnet CCD checked without key material',()=>{
  const ready=assessSponsorAccounts(info(),info(500000n));
  assert.equal(ready.status,'ACCOUNTS_PRESENT_SPONSOR_HAS_CCD');
  assert.equal(sponsorCanProceed(ready),true);
  assert.equal(sponsorCanProceed(assessSponsorAccounts(info(),info(0n))),false);
  assert.equal(sponsorCanProceed(assessSponsorAccounts(null,info(1n))),false);
  assert.equal(sponsorCanProceed(assessSponsorAccounts(info(),null)),false);
});

test('read-only checks do not confuse RPC outage with confirmed account absence',async()=>{
  const unavailable=await inspectSponsorAccounts(conf,{
    accountLookup:async address=>{
      if(address===sponsor)throw Error('RPC_DOWN');
      return info();
    }
  });
  assert.equal(unavailable.status,'ONCHAIN_LOOKUP_UNAVAILABLE');
  assert.equal(unavailable.sponsorExists,null);
  assert.equal(sponsorCanProceed(unavailable),false);
});

test('unconfigured sponsor accounts remain closed without querying RPC',async()=>{
  let queried=0;
  const result=await inspectSponsorAccounts({...conf,address:null},{
    accountLookup:async()=>{queried++;return info();}
  });
  assert.equal(result.status,'PUBLIC_ACCOUNTS_NOT_CONFIGURED');
  assert.equal(queried,0);
});

test('public on-chain status works while payments are locked and never exports secrets',async()=>{
  const r=await callRoute();
  assert.equal(r.statusCode,200);
  assert.equal(r.data.status,'ACCOUNTS_PRESENT_SPONSOR_HAS_CCD');
  assert.equal(r.data.settlementVerified,false);
  assert.equal(r.data.signingKeyVerified,false);
  const publicView=JSON.stringify(r.data);
  assert.equal(publicView.includes('SENSITIVE'),false);
  assert.equal(publicView.includes('test-token'),false);
  assert.equal(publicView.includes('test.upstash.io'),false);
  const imp=fakeRes();
  await accountRoute({method:'POST',headers:{}},imp);
  assert.equal(imp.out.statusCode,405);
});

test('global quota, Redis unavailability or lookup faults fail closed',async()=>{
  const limited=await callRoute(conf,{rateLimit:async()=>false});
  assert.equal(limited.statusCode,429);
  const redisDown=await callRoute(conf,{rateLimit:async()=>{throw Error('DOWN')}});
  assert.equal(redisDown.statusCode,503);
  let lookups=0;
  const fail=await callRoute(conf,{inspectAccounts:async()=>{lookups++;throw Error('RPC_FAIL')}});
  assert.equal(fail.statusCode,503);
  assert.equal(lookups,1);
});

test('fee-paying SDK is never constructed before on-chain sponsor prerequisite',async()=>{
  const states=[
    {status:'ONCHAIN_LOOKUP_UNAVAILABLE',merchantExists:null,sponsorExists:null,sponsorHasAvailableCcd:null},
    {status:'ACCOUNTS_NOT_READY',merchantExists:true,sponsorExists:true,sponsorHasAvailableCcd:false},
    {status:'ACCOUNTS_NOT_READY',merchantExists:false,sponsorExists:true,sponsorHasAvailableCcd:true}
  ];
  for(const accountStatus of states){
    await assert.rejects(()=>makeTrustGateFacilitator(conf,{
      inspectAccounts:async()=>accountStatus
    }),/SPONSOR_ONCHAIN_PREFLIGHT_FAILED/);
  }
});
