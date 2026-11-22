import test from 'node:test';
import assert from 'node:assert/strict';
import {buildBasicAccountSigner,AccountAddress,SequenceNumber} from '@concordium/web-sdk';
import {ExactConcordiumScheme} from '@x402/concordium/exact/client';
import {PROOF_CONTEXT} from '../lib/proof-message.js';
import {
  EXACT_TESTNET_ORIGIN,EXACT_TESTNET_MERCHANT,EXACT_TESTNET_SPONSOR,
  assertExactTestnetOffer,createSenderPaymentEnvelope,buildOwnerSignerFromWalletExport,
  inspectExactClientReadiness,submitExactTestnetPayment
} from '../lib/x402-exact-local-client.js';
import {X402_SCOPE} from '../lib/x402-client-intent.js';

const SEED='9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60';
const OWNER=PROOF_CONTEXT.owner;
const requirements={
  scheme:'exact',network:X402_SCOPE.network,asset:'CCD',
  amount:'100000',payTo:EXACT_TESTNET_MERCHANT,maxTimeoutSeconds:90,
  extra:{feePayer:EXACT_TESTNET_SPONSOR}
};
const challenge={x402Version:2,
  resource:{url:EXACT_TESTNET_ORIGIN+'/api/x402/resource',
    description:'One payment for a verified Concordium Agent #1323 evidence package',
    mimeType:'application/json',serviceName:'TrustGate AI'},
  accepts:[requirements]
};
function buildMockOfficialScheme({accountAddress,signer}){
  const scheme=new ExactConcordiumScheme({accountAddress,signer});
  // Replace the TESTNET gRPC read with an offline deterministic nonce.
  // No chain communication and no real account key.
  scheme.createGrpcClient=()=>({
    getNextAccountNonce:async()=>({nonce:SequenceNumber.create(1n)})
  });
  return scheme;
}
function mockFetch(url,opts={}){
  const urlPath=new URL(url).pathname;
  if(urlPath==='/api/x402/status')
    return Promise.resolve(Response.json({status:'CONFIGURED_NOT_PAYMENT_TESTED'}));
  if(urlPath==='/api/sponsor/status')
    return Promise.resolve(Response.json({status:'CONFIGURED_UNTESTED'}));
  if(urlPath==='/api/sponsor/accounts')
    return Promise.resolve(Response.json({
      signingKeyVerified:true,sponsorHasAvailableCcd:true,
      merchant:EXACT_TESTNET_MERCHANT,sponsor:EXACT_TESTNET_SPONSOR
    }));
  if(urlPath==='/api/x402/quote')
    return Promise.resolve(Response.json({
      mode:'TESTNET_QUOTE_ONLY',network:X402_SCOPE.network,
      amountMicroCcd:'100000',asset:'CCD',payTo:EXACT_TESTNET_MERCHANT,
      paymentRequired:challenge
    }));
  if(urlPath==='/api/x402/resource'){
    assert.match(opts.headers?.['X-TRUSTGATE-INTENT']||'',/^[A-Za-z0-9+/=]+$/);
    const intent=JSON.parse(Buffer.from(opts.headers['X-TRUSTGATE-INTENT'],'base64').toString());
    assert.equal(intent.account,OWNER);
    assert.equal(intent.payTo,EXACT_TESTNET_MERCHANT);
    assert.ok(intent.signature && Object.keys(intent.signature).length);
    if(!opts.headers?.['PAYMENT-SIGNATURE'])
      return Promise.resolve(Response.json(challenge,{status:402}));
    const envelope=JSON.parse(Buffer.from(opts.headers['PAYMENT-SIGNATURE'],'base64').toString());
    assert.equal(envelope.x402Version,2);
    assert.equal(envelope.accepted.network,X402_SCOPE.network);
    assert.equal(envelope.payload.signedTransaction.header.sender,OWNER);
    assert.ok(Object.keys(envelope.payload.signedTransaction.signatures.sender).length);
    assert.equal(Object.keys(envelope.payload.signedTransaction.signatures.sponsor||{}).length,0);
    return Promise.resolve(Response.json({
      kind:'PAID_VERIFIED_AGENT_EVIDENCE',ownerAccount:OWNER,
      network:X402_SCOPE.network,merchant:EXACT_TESTNET_MERCHANT,
      priceMicroCcd:'100000',transaction:'a'.repeat(64)
    }));
  }
  throw Error('TEST_NETWORK_NOT_PERMITTED:'+url);
}

test('official Testnet x402 exact challenge is pinned to CCD, 100000, merchant and sponsor',()=>{
  assert.deepEqual(assertExactTestnetOffer(challenge),challenge);
  const quote={mode:'TESTNET_QUOTE_ONLY',network:X402_SCOPE.network,
    amountMicroCcd:'100000',asset:'CCD',payTo:EXACT_TESTNET_MERCHANT,
    paymentRequired:challenge};
  assert.deepEqual(assertExactTestnetOffer(quote),challenge);
  for(const patch of [
    {amount:'200000'},
    {asset:'EURR'},
    {network:'ccd:9dd9ca4d19e9393877d2c44b70f89acb'},
    {payTo:OWNER},
    {extra:{feePayer:OWNER}},
    {maxTimeoutSeconds:0}
  ])assert.throws(()=>assertExactTestnetOffer({
    ...challenge,accepts:[{...requirements,...patch}]
  }));
});

test('official SDK creates sender-first partial payment with no Sponsor signature',async()=>{
  const scheme=buildMockOfficialScheme({
    accountAddress:AccountAddress.fromBase58(OWNER),signer:buildBasicAccountSigner(SEED)
  });
  const signed=await scheme.createPaymentPayload(2,requirements);
  const payload=createSenderPaymentEnvelope(challenge,signed);
  const tx=payload.payload.signedTransaction;
  assert.equal(tx.version,1);
  assert.equal(tx.header.sender,OWNER);
  assert.equal(tx.payload.amount,'100000');
  assert.equal(tx.payload.toAddress,EXACT_TESTNET_MERCHANT);
  assert.equal(tx.header.sponsor.account,EXACT_TESTNET_SPONSOR);
  assert.ok(Object.keys(tx.signatures.sender).length>0);
  assert.equal(Object.keys(tx.signatures.sponsor||{}).length,0);
  assert.equal(payload.accepted.extra.feePayer,EXACT_TESTNET_SPONSOR);
  for(const mutation of [
    x=>x.header.sender=EXACT_TESTNET_SPONSOR,
    x=>x.payload.amount='200000',
    x=>x.payload.toAddress=OWNER,
    x=>x.signatures.sender={},
    x=>x.signatures.sponsor={0:{0:'f'.repeat(128)}}
  ]){
    const damaged=structuredClone(signed);
    mutation(damaged.payload.signedTransaction);
    assert.throws(()=>createSenderPaymentEnvelope(challenge,damaged));
  }
});

test('readiness requires independently verified Sponsor, not just an attractive quote',async()=>{
  assert.deepEqual(await inspectExactClientReadiness(mockFetch),{
    network:X402_SCOPE.network,asset:'CCD',amountMicroCcd:'100000',
    merchant:EXACT_TESTNET_MERCHANT,sponsor:EXACT_TESTNET_SPONSOR,
    gatewayReady:true,facilitatorHandshake:true
  });
  const failing=async(url,opts)=>{
    if(url.endsWith('/api/sponsor/accounts'))
      return Response.json({signingKeyVerified:false});
    return mockFetch(url,opts);
  };
  await assert.rejects(()=>inspectExactClientReadiness(failing),/NOT_READY/);
});

test('locally signed scoped access intent and x402 PAYMENT-SIGNATURE complete offline mocked server',async()=>{
  // CLI must not sign or submit from CI/cloud. Only this isolated test
  // temporarily removes the CI marker; no real endpoints are reachable.
  const existing=process.env.CI;
  const stages=[];
  try {
    delete process.env.CI;
    const result=await submitExactTestnetPayment({
      ownerPrivateKey:SEED,fetchImpl:mockFetch,
      createScheme:buildMockOfficialScheme,
      onStage:s=>stages.push(s)
    });
    assert.equal(result.verified,true);
    assert.equal(result.transaction,'a'.repeat(64));
    assert.equal(result.evidenceKind,'PAID_VERIFIED_AGENT_EVIDENCE');
    assert.equal(result.grantsPaidResource,true);
    assert.equal(stages.length,4);
  }finally{
    if(existing===undefined)delete process.env.CI;else process.env.CI=existing;
  }
});

test('local account export rejects malformed data before creating a payment',()=>{
  assert.throws(()=>buildOwnerSignerFromWalletExport('not a JSON export'),/EXPORT_INVALID/);
});

test('official client accepts an injected local SDK signer and rejects ambiguous signer sources',async()=>{
  const existing=process.env.CI;
  try{
    delete process.env.CI;
    const signer=buildBasicAccountSigner(SEED);
    const result=await submitExactTestnetPayment({
      ownerSigner:signer,fetchImpl:mockFetch,createScheme:buildMockOfficialScheme
    });
    assert.equal(result.verified,true);
    await assert.rejects(()=>submitExactTestnetPayment({
      ownerSigner:signer,ownerPrivateKey:SEED,fetchImpl:mockFetch
    }),/AMBIGUOUS/);
  }finally{
    if(existing===undefined)delete process.env.CI;else process.env.CI=existing;
  }
});

test('rejects any local credential omission before backend or blockchain calls',async()=>{
  let calls=0;
  await assert.rejects(()=>submitExactTestnetPayment({
    ownerPrivateKey:'invalid',
    fetchImpl:()=>{calls++;throw Error('DO_NOT_CALL_REMOTE');}
  }),/OWNER_LOCAL_SIGNER_REQUIRED/);
  assert.equal(calls,0);
});

test('a failed or unknown resource settlement cannot be treated as payment success',async()=>{
  const existing=process.env.CI;
  try{
    delete process.env.CI;
    const rejectFetch=async(url,options)=>{
      if(url.endsWith('/api/x402/resource') && options?.headers?.['PAYMENT-SIGNATURE'])
        return Response.json({error:'SETTLEMENT_NOT_CONFIRMED',transaction:'a'.repeat(64)},{status:503});
      return mockFetch(url,options);
    };
    await assert.rejects(()=>submitExactTestnetPayment({
      ownerPrivateKey:SEED,fetchImpl:rejectFetch,
      createScheme:buildMockOfficialScheme
    }),e=>e.message.includes('X402_SETTLEMENT_NOT_CONFIRMED:503') &&
       e.transaction==='a'.repeat(64));
  }finally{
    if(existing===undefined)delete process.env.CI;else process.env.CI=existing;
  }
});
