import test from 'node:test';
import assert from 'node:assert/strict';
import {readSponsorConfig,publicSponsorStatus,validateSponsorPayment,handleSponsor} from '../lib/x402-facilitator.js';
import {readX402Config,X402_TESTNET} from '../lib/x402-config.js';
import {PROOF_CONTEXT} from '../lib/proof-message.js';
import sponsorStatus from '../api/sponsor/status.js';
import sponsorSupported from '../api/sponsor/supported.js';
import sponsorVerify from '../api/sponsor/verify.js';
import sponsorSettle from '../api/sponsor/settle.js';

const merchant='4XYepvZZJyFkKTTgoTCmNuQYar1PBiscdZBh6cRotsG2Y7SBDf';
// Production sponsor address is public. The test-only key below is NOT this account's key.
const sponsor='4Q9ZNet1wKBCS3HWYxBSrHjKPfyois52h3gYUUHKe8Fw4Cf3s3';
const authToken='unit-test-secret-with-more-than-32-characters';
const env={
  TRUSTGATE_X402_ENABLED:'testnet',
  TRUSTGATE_X402_MERCHANT_ADDRESS:merchant,
  TRUSTGATE_X402_FACILITATOR_URL:'https://trustgate-ai.vercel.app/api/sponsor',
  TRUSTGATE_FACILITATOR_ENABLED:'testnet',
  TRUSTGATE_FACILITATOR_SPONSOR_ADDRESS:sponsor,
  TRUSTGATE_FACILITATOR_SPONSOR_PRIVATE_KEY:'f'.repeat(64),
  TRUSTGATE_FACILITATOR_AUTH_TOKEN:authToken,
  TRUSTGATE_X402_REDIS_URL:'https://store.upstash.io',
  TRUSTGATE_X402_REDIS_TOKEN:'test-only-redis-token'
};
const config=readSponsorConfig(env);
const allowed={scheme:'exact',network:X402_TESTNET,asset:'CCD',
  amount:'100000',payTo:merchant,maxTimeoutSeconds:90,extra:{feePayer:sponsor}};
function body(req=allowed) {
  return {
    x402Version:2,
    paymentRequirements:req,
    paymentPayload:{
      x402Version:2,accepted:req,
      payload:{signedTransaction:{
        version:1,header:{sender:PROOF_CONTEXT.owner,sponsor:{account:sponsor}}
      }}
    }
  };
}
function fakeRes(){
  const out={statusCode:null,data:null,headers:{}};
  return {out,setHeader(k,v){out.headers[k]=v;},
    status(statusCode){out.statusCode=statusCode;return {json(data){out.data=data;return out;}}}};
}
async function call(path,method,token,requestBody,options={}){
  const res=fakeRes();
  await handleSponsor({method,body:requestBody,headers:{
    authorization:token?'Bearer '+token:undefined,
    'content-type':'application/json'
  }},res,{config,path,rateLimit:async()=>true,...options});
  return res.out;
}
const fakeEngine={
  getSupported:()=>({kinds:[{x402Version:2,scheme:'exact',network:X402_TESTNET,
    extra:{feePayer:sponsor}}],extensions:[],signers:{'ccd:*':[sponsor]}}),
  verify:async()=>({isValid:true,payer:PROOF_CONTEXT.owner}),
  settle:async()=>({success:true,transaction:'b'.repeat(64),
    network:X402_TESTNET,payer:PROOF_CONTEXT.owner})
};

test('public sponsor status and actual Vercel route imports remain fail-closed',async()=>{
  assert.equal(readSponsorConfig({}).configured,false);
  const r=await new Promise((resolve,reject)=>{
    const res=fakeRes();
    Promise.resolve(sponsorStatus({method:'GET',headers:{}},res)).then(()=>resolve(res.out),reject);
  });
  assert.equal(r.statusCode,200);
  assert.equal(r.data.status,'LOCKED_UNTIL_CONFIGURED');
  for(const handler of [sponsorSupported,sponsorVerify,sponsorSettle]){
    const res=fakeRes();
    await handler({method:'GET',headers:{}},res);
    assert.equal(res.out.statusCode,503);
    assert.equal(res.out.data.error,'SPONSOR_NOT_CONFIGURED');
  }
});
test('first-party sponsor requires separate checksum-valid account and all private controls',()=>{
  assert.equal(config.configured,true);
  assert.equal(config.address,sponsor);
  for(const changed of [
    {TRUSTGATE_FACILITATOR_ENABLED:''},
    {TRUSTGATE_FACILITATOR_SPONSOR_ADDRESS:merchant},
    {TRUSTGATE_FACILITATOR_SPONSOR_ADDRESS:PROOF_CONTEXT.owner},
    {TRUSTGATE_FACILITATOR_SPONSOR_ADDRESS:'4FmiTW2L4RvCsSVTjFAavYvrgnPLGNj43eiwPYmbhNqtAcMbWW'},
    {TRUSTGATE_FACILITATOR_SPONSOR_PRIVATE_KEY:''},
    {TRUSTGATE_FACILITATOR_AUTH_TOKEN:'short'},
    {TRUSTGATE_X402_ENABLED:''},
    {TRUSTGATE_X402_REDIS_TOKEN:''},
    {TRUSTGATE_X402_FACILITATOR_URL:'https://elsewhere.example.com'}
  ]){
    assert.equal(readSponsorConfig({...env,...changed}).configured,false);
  }
  assert.equal(readX402Config(env).configured,true);
  assert.equal(readX402Config({...env,TRUSTGATE_FACILITATOR_AUTH_TOKEN:''}).configured,false);
  const publicView=JSON.stringify(publicSponsorStatus(config));
  assert.equal(publicView.includes(env.TRUSTGATE_FACILITATOR_SPONSOR_PRIVATE_KEY),false);
  assert.equal(publicView.includes(authToken),false);
  assert.equal(publicView.includes(env.TRUSTGATE_X402_REDIS_TOKEN),false);
});
test('SDK request restrictions prevent cross-network, wrong owner, payee, amount or sponsor',()=>{
  assert.equal(validateSponsorPayment(body(),config),true);
  const cases=[
    body({...allowed,network:'ccd:9dd9ca4d19e9393877d2c44b70f89acb'}),
    body({...allowed,payTo:PROOF_CONTEXT.owner}),
    body({...allowed,amount:'100001'}),
    body({...allowed,asset:'USDR'}),
    body({...allowed,scheme:'any'}),
    body({...allowed,maxTimeoutSeconds:120}),
    {...body(),x402Version:1},
    {...body(),paymentPayload:{...body().paymentPayload,
      accepted:{...allowed,extra:{feePayer:merchant}}}},
    {...body(),paymentPayload:{...body().paymentPayload,
      payload:{...body().paymentPayload.payload,
        signedTransaction:{version:1,header:{sender:merchant,sponsor:{account:sponsor}}}}}}
  ];
  for(const input of cases)assert.equal(validateSponsorPayment(input,config),false);
});
test('official Concordium V2 client structure without payload.sender is accepted',()=>{
  const p=body();
  assert.equal(p.paymentPayload.payload.sender,undefined);
  assert.equal(validateSponsorPayment(p,config),true);
  const tx=p.paymentPayload.payload.signedTransaction;
  assert.equal(tx.header.sender,PROOF_CONTEXT.owner);
  assert.equal(tx.header.sponsor.account,sponsor);
});
test('bearer authentication is mandatory for supported, verify and settle',async()=>{
  let engines=0;
  const loader=async()=>{engines++;return fakeEngine;};
  for(const path of ['/api/sponsor/supported','/api/sponsor/verify','/api/sponsor/settle']){
    const method=path.endsWith('supported')?'GET':'POST';
    for(const token of [null,'incorrect-invalid-token-with-more-than-32-chars']){
      const r=await call(path,method,token,body(),{makeEngine:loader});
      assert.equal(r.statusCode,401);
      assert.equal(r.data.error,'SPONSOR_AUTH_REQUIRED');
    }
  }
  assert.equal(engines,0);
});
test('out-of-scope payloads cannot reach the SDK verification or sponsor signer',async()=>{
  let engines=0;
  const r=await call('/api/sponsor/settle','POST',authToken,
    body({...allowed,amount:'9999999'}),{
      makeEngine:async()=>{engines++;return fakeEngine;}
    });
  assert.equal(r.statusCode,403);
  assert.equal(r.data.error,'PAYMENT_OUTSIDE_TRUSTGATE_SCOPE');
  assert.equal(engines,0);
});
test('supported advertises only Testnet and scheme when fully enabled',async()=>{
  const r=await call('/api/sponsor/supported','GET',authToken,null,{
    makeEngine:async()=>fakeEngine
  });
  assert.equal(r.statusCode,200);
  assert.equal(r.data.kinds[0].network,X402_TESTNET);
  assert.equal(r.data.kinds[0].extra.feePayer,sponsor);
});
test('verify and settle call official facilitator interface only for in-scope requests',async()=>{
  for(const [path,field] of [['verify','isValid'],['settle','success']]){
    const r=await call('/api/sponsor/'+path,'POST',authToken,body(),{
      makeEngine:async()=>fakeEngine
    });
    assert.equal(r.statusCode,200);
    assert.equal(r.data[field],true);
  }
});
test('invalid JSON, oversized bodies and unsupported request methods fail closed',async()=>{
  const o=await call('/api/sponsor/verify','POST',authToken,{x402Version:2},{makeEngine:async()=>fakeEngine});
  assert.equal(o.statusCode,403);
  const s=await call('/api/sponsor/verify','POST',authToken,{
    ...body(),oversized:'x'.repeat(24000)
  },{makeEngine:async()=>fakeEngine});
  assert.equal(s.statusCode,413);
  const m=await call('/api/sponsor/supported','POST',authToken,null,{makeEngine:async()=>fakeEngine});
  assert.equal(m.statusCode,405);
});
test('sponsor limits fail closed before invoking the official SDK',async()=>{
  let engines=0;
  const loader=async()=>{engines++;return fakeEngine;};
  const limit=await call('/api/sponsor/settle','POST',authToken,body(),{
    makeEngine:loader,rateLimit:async()=>false
  });
  assert.equal(limit.statusCode,429);
  assert.equal(limit.data.error,'SPONSOR_RATE_LIMIT_EXCEEDED');
  const unavailable=await call('/api/sponsor/verify','POST',authToken,body(),{
    makeEngine:loader,rateLimit:async()=>{throw Error('redis_down');}
  });
  assert.equal(unavailable.statusCode,503);
  assert.equal(unavailable.data.error,'SPONSOR_RATE_LIMIT_UNAVAILABLE');
  assert.equal(engines,0);
});

test('offline startup imports official facilitator and Concordium sponsor classes',async()=>{
  const [{x402Facilitator},{ExactConcordiumScheme},{toConcordiumFacilitatorSigner}]=await Promise.all([
    import('@x402/core/facilitator'),import('@x402/concordium/exact/facilitator'),
    import('@x402/concordium')
  ]);
  assert.equal(typeof x402Facilitator,'function');
  assert.equal(typeof ExactConcordiumScheme,'function');
  assert.equal(typeof toConcordiumFacilitatorSigner,'function');
});
