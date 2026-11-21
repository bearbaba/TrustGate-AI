import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {evaluateWalletSponsorReadiness as check}
  from '../lib/x402-wallet-readiness.js';

const merchant='4XYepvZZJyFkKTTgoTCmNuQYar1PBiscdZBh6cRotsG2Y7SBDf';
const sponsorWallet='4Q9ZNet1wKBCS3HWYxBSrHjKPfyois52h3gYUUHKe8Fw4Cf3s3';
const network='ccd:4221332d34e1694168c2a0c0b3fd0f27';
const gateway={status:'CONFIGURED_NOT_PAYMENT_TESTED',prerequisites:[],merchant,network};
const sponsor={status:'CONFIGURED_UNTESTED',prerequisites:[],network};
const accounts={status:'ACCOUNTS_PRESENT_SPONSOR_HAS_CCD',
  merchantExists:true,sponsorExists:true,sponsorHasAvailableCcd:true,
  merchant,sponsor:sponsorWallet,signingKeyVerified:true,
  signingKeyStatus:'SPONSOR_ONCHAIN_SIGNING_KEY_VERIFIED',network};

test('missing public status is not interpreted as safe; status cannot unlock wallet',()=>{
  for(const pair of [[null,null],[gateway,null],[null,sponsor]]) {
    const result=check(pair[0],pair[1],accounts);
    assert.equal(result.ready,false);
    assert.equal(result.needsAccounts,false);
    assert.equal(result.code,'READINESS_UNAVAILABLE');
  }
});

test('missing Sponsor signing key is prioritized and surfaced despite missing gateway flags',()=>{
  const result=check({...gateway,status:'LOCKED_UNTIL_CONFIGURED',
    prerequisites:['ENABLE_TESTNET_GATEWAY','HTTPS_CONCORDIUM_FACILITATOR']},
  {...sponsor,status:'LOCKED_UNTIL_CONFIGURED',
    prerequisites:['FACILITATOR_DISABLED','SPONSOR_KEY_SECURELY_CONFIGURED',
      'SPONSOR_API_AUTH_CONFIGURED']});
  assert.equal(result.ready,false);
  assert.equal(result.needsAccounts,false);
  assert.equal(result.code,'SPONSOR_KEY_SECURELY_CONFIGURED');
  assert.match(result.message,/signing key/i);
  assert.match(result.message,/no wallet signature/i);
});

test('account lookup is not needed until Gateway and Sponsor flags both pass',()=>{
  for(const [overriddenGateway,overriddenSponsor] of [
    [{...gateway,status:'LOCKED_UNTIL_CONFIGURED'},sponsor],
    [gateway,{...sponsor,status:'LOCKED_UNTIL_CONFIGURED'}],
    [{...gateway,prerequisites:['ENABLE_TESTNET_GATEWAY']},sponsor],
    [gateway,{...sponsor,prerequisites:['SPONSOR_API_AUTH_CONFIGURED']}]
  ]){
    const r=check(overriddenGateway,overriddenSponsor);
    assert.equal(r.ready,false);
    assert.equal(r.needsAccounts,false);
  }
  const readyForAccountCheck=check(gateway,sponsor);
  assert.equal(readyForAccountCheck.ready,false);
  assert.equal(readyForAccountCheck.needsAccounts,true);
});

test('funded Sponsor alone is insufficient until correct on-chain key is verified',()=>{
  const wrongKey=check(gateway,sponsor,{
    ...accounts,signingKeyVerified:false,
    signingKeyStatus:'SPONSOR_KEY_NOT_CONFIGURED'
  });
  assert.equal(wrongKey.ready,false);
  assert.equal(wrongKey.code,'SPONSOR_KEY_NOT_CONFIGURED');
  for(const bad of [
    {...accounts,sponsorHasAvailableCcd:false},
    {...accounts,merchantExists:false},
    {...accounts,sponsorExists:false},
    {...accounts,merchant:'other'},
    {...accounts,sponsor:merchant},
    {...accounts,status:'ONCHAIN_LOOKUP_UNAVAILABLE'}
  ])assert.equal(check(gateway,sponsor,bad).ready,false);
});

test('mismatched networks never unlock checkout',()=>{
  for(const patch of [
    {g:{...gateway,network:'ccd:wrong'},s:sponsor,a:accounts},
    {g:gateway,s:{...sponsor,network:'ccd:wrong'},a:accounts},
    {g:gateway,s:sponsor,a:{...accounts,network:'ccd:wrong'}}
  ]) {
    const result=check(patch.g,patch.s,patch.a);
    assert.equal(result.ready,false);
    assert.equal(result.code,'NETWORK_MISMATCH');
  }
});

test('only complete, live, on-chain verified Sponsor state enables wallet review',()=>{
  assert.deepEqual(check(gateway,sponsor,accounts),{
    ready:true,needsAccounts:false,code:'OWNER_REVIEW_READY',
    message:'Sponsor verified. You may initiate a wallet review of exactly 0.1 Testnet CCD. No funds move without your approval.'
  });
});

test('browser button is disabled initially and is guarded until public readiness verified',async()=>{
  const html=await readFile(new URL('../public/x402-gateway.html',import.meta.url),'utf8');
  const js=await readFile(new URL('../src/x402-sponsored-wallet.js',import.meta.url),'utf8');
  const statusJs=await readFile(new URL('../public/x402-gateway.js',import.meta.url),'utf8');
  assert.match(html,/<button[^>]+id="sponsoredWalletSend"[^>]+disabled/);
  assert.match(js,/if\(!checkoutReady\)\{/);
  assert.match(js,/button\.disabled=!checkoutReady/);
  assert.match(js,/evaluateWalletSponsorReadiness\(gateway,sponsor,accounts\)/);
  assert.match(js,/getJson\('\/api\/sponsor\/status'\)/);
  assert.match(js,/document\.addEventListener\('trustgate:gateway-status-refreshed',refreshWalletReadiness\)/);
  assert.match(statusJs,/document\.dispatchEvent\(new Event\('trustgate:gateway-status-refreshed'\)\)/);
});
