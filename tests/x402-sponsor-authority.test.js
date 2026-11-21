import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveSponsorPublicKey,assessSponsorSigningAuthority,inspectSponsorSigningAuthority
} from '../lib/x402-sponsor-authority.js';
import { makeTrustGateFacilitator } from '../lib/x402-facilitator.js';

// RFC 8032 Section 7.1, Ed25519 test vector 1, public data only.
// This is NOT a TrustGate key and never belongs in Production.
const seed='9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60';
const expectedPublic='d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a';
const address='4Q9ZNet1wKBCS3HWYxBSrHjKPfyois52h3gYUUHKe8Fw4Cf3s3';
const credential=(publicKey=expectedPublic,opts={})=>({
  accountAddress:{address},
  accountThreshold:opts.accountThreshold??1,
  accountCredentials:{
    0:{v:0,value:{
      type:opts.type??'initial',
      contents:{credentialPublicKeys:{
        threshold:opts.credentialThreshold??1,
        keys:opts.omitKey?{}:{
          0:{schemeId:opts.scheme??'Ed25519',verifyKey:publicKey}
        }
      }}
    }}
  }
});

test('RFC 8032 known public-key vector, never use a live Sponsor secret',()=>{
  assert.equal(deriveSponsorPublicKey(seed),expectedPublic);
  assert.equal(deriveSponsorPublicKey(seed.toUpperCase()),expectedPublic);
  assert.throws(()=>deriveSponsorPublicKey('0'.repeat(8)));
  assert.throws(()=>deriveSponsorPublicKey('not-a-private-key'));
});

test('single-key on-chain authority matches only active credential zero, key zero',()=>{
  const result=assessSponsorSigningAuthority(credential(),expectedPublic);
  assert.deepEqual(result,{ok:true,code:'SPONSOR_ONCHAIN_SIGNING_KEY_VERIFIED'});
  assert.equal(assessSponsorSigningAuthority(credential(), '1'.repeat(64)).ok,false);
  assert.equal(assessSponsorSigningAuthority(credential('2'.repeat(64)), expectedPublic).ok,false);
  assert.equal(assessSponsorSigningAuthority(credential(expectedPublic,{omitKey:true}),expectedPublic).ok,false);
  assert.equal(assessSponsorSigningAuthority(null,expectedPublic).ok,false);
  assert.equal(assessSponsorSigningAuthority(credential(), 'not-hex').ok,false);
});

test('multi-signature account, credential threshold and unsupported schemes fail closed',()=>{
  assert.equal(assessSponsorSigningAuthority(
    credential(expectedPublic,{accountThreshold:2}),expectedPublic
  ).code,'UNSUPPORTED_SPONSOR_ACCOUNT_THRESHOLD');
  assert.equal(assessSponsorSigningAuthority(
    credential(expectedPublic,{credentialThreshold:2}),expectedPublic
  ).code,'UNSUPPORTED_SPONSOR_CREDENTIAL_THRESHOLD');
  assert.equal(assessSponsorSigningAuthority(
    credential(expectedPublic,{scheme:'Unknown'}),expectedPublic
  ).code,'SPONSOR_ONCHAIN_KEY_UNAVAILABLE');
  assert.equal(assessSponsorSigningAuthority(
    credential(expectedPublic,{type:'unsupported'}),expectedPublic
  ).code,'SPONSOR_CREDENTIAL_UNAVAILABLE');
});

test('on-chain lookup mismatch or node outage cannot verify a signing key',async()=>{
  const config={address,privateKey:seed};
  const good=await inspectSponsorSigningAuthority(config,{
    accountLookup:async()=>credential()
  });
  assert.equal(good.ok,true);
  const mismatch=await inspectSponsorSigningAuthority({...config,privateKey:'1'.repeat(64)},{
    accountLookup:async()=>credential()
  });
  assert.equal(mismatch.code,'SPONSOR_ONCHAIN_SIGNING_KEY_MISMATCH');
  const error=await inspectSponsorSigningAuthority(config,{
    accountLookup:async()=>{throw Error('RPC_CONNECTION_FAILED');}
  });
  assert.deepEqual(error,{ok:false,code:'SPONSOR_KEY_LOOKUP_UNAVAILABLE'});
  const unconfigured=await inspectSponsorSigningAuthority({address,privateKey:''},{
    accountLookup:async()=>credential()
  });
  assert.equal(unconfigured.ok,false);
});

test('funded sponsor alone cannot construct fee-payer signer when key is unauthorized',async()=>{
  let calls=0;
  const config={address,privateKey:seed};
  await assert.rejects(()=>makeTrustGateFacilitator(config,{
    inspectAccounts:async()=>{
      calls++;
      return {
        status:'ACCOUNTS_PRESENT_SPONSOR_HAS_CCD',
        merchantExists:true,sponsorExists:true,sponsorHasAvailableCcd:true
      };
    },
    inspectSigningAuthority:async()=>{
      calls++;
      return {ok:false,code:'SPONSOR_ONCHAIN_SIGNING_KEY_MISMATCH'};
    }
  }),/SPONSOR_KEY_AUTHORITY_UNVERIFIED/);
  assert.equal(calls,2);
});
