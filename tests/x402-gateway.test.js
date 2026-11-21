import test from 'node:test';
import assert from 'node:assert/strict';
import { readX402Config, publicX402Status, buildX402SignedMessage, validateX402Intent, X402_TESTNET } from '../lib/x402-config.js';
import { handleX402 } from '../lib/x402-gateway.js';
import { replayKeys, reserveX402Payment, markX402Settled, RESERVE_LUA, MARK_SETTLED_LUA } from '../lib/x402-store.js';
import { PROOF_CONTEXT } from '../lib/proof-message.js';

const merchant='4XYepvZZJyFkKTTgoTCmNuQYar1PBiscdZBh6cRotsG2Y7SBDf';
const env={
  TRUSTGATE_X402_ENABLED:'testnet',
  TRUSTGATE_X402_MERCHANT_ADDRESS:merchant,
  TRUSTGATE_X402_FACILITATOR_URL:'https://sponsor.example.com',
  TRUSTGATE_X402_REDIS_URL:'https://kv.example.com',
  TRUSTGATE_X402_REDIS_TOKEN:'unit-test-secret'
};
const config=readX402Config(env);
const NOW=Date.UTC(2026,10,20,15,0,0);
const makeIntent=()=>({
  version:'trustgate-x402-intent/v1',
  network:X402_TESTNET,badge:PROOF_CONTEXT.badge,account:PROOF_CONTEXT.owner,
  resource:'/api/x402/resource',payTo:merchant,asset:'CCD',amountMicroCcd:'100000',
  nonce:'8'.repeat(32),issuedAt:NOW-1000,signature:{0:{0:'a'.repeat(128)}}
});
const requirements={scheme:'exact',network:X402_TESTNET,amount:'100000',asset:'CCD',payTo:merchant,
  maxTimeoutSeconds:90,extra:{feePayer:'3kBx2h5Y2veb4hZvAE2c1Zr6DYJwWbPr9xQJJBPWyFnXHF9UuN'}};
function fakeResponse() {
  const out={headers:{},statusCode:0,data:null};
  return {
    out,
    setHeader(k,v){out.headers[k]=v;},
    status(statusCode){out.statusCode=statusCode;return {json(data){out.data=data;return out;}}}
  };
}
const badgeVerifier=async()=>({ok:true,checkedAt:'2026-11-20T15:00:00Z',checks:{
  status:'Active',tokenId:1323,ownerAccount:PROOF_CONTEXT.owner,
  hashMatchesOnChain:true,cardSha256:'ed33956577d378ef0bfd537505863d846a2c130513302a2d45d99e5bfc009c44'
}});
const makeOffer=(options={})=>async()=>({
  paymentRequired:{x402Version:2,resource:{url:'https://trustgate-ai.vercel.app/api/x402/resource'},accepts:[requirements]},
  requirements,server:{
    verifyPayment:options.verifyPayment|| (async()=>({isValid:true,payer:PROOF_CONTEXT.owner})),
    settlePayment:options.settlePayment|| (async()=>({success:true,network:X402_TESTNET,
      transaction:'b'.repeat(64),payer:PROOF_CONTEXT.owner}))
  }
});
const auth=()=>Buffer.from(JSON.stringify(makeIntent())).toString('base64');
const payment=()=>({x402Version:2,accepted:requirements,payload:{sender:PROOF_CONTEXT.owner}});
const wire=(p=payment())=>Buffer.from(JSON.stringify(p)).toString('base64');
const deps={
  config,now:NOW,makeServer:makeOffer(),accountLookup:async()=>({fixture:true}),
  verifySignature:async()=>true,verifyBadge:badgeVerifier,
  reserve:async()=>({ok:true,keys:{intentKey:'a',paymentKey:'b'}}),
  markSettled:async()=>true
};
async function call(path,headers={},overrides={}){
  const res=fakeResponse();
  await handleX402({method:'GET',headers},res,{...deps,path,...overrides});
  return res.out;
}

test('real Testnet gateway stays locked without merchant, sponsor and atomic store',async()=>{
  const status=publicX402Status(readX402Config({}));
  assert.equal(status.status,'LOCKED_UNTIL_CONFIGURED');
  assert.ok(status.prerequisites.includes('SEPARATE_MERCHANT_ACCOUNT'));
  const v=await call('/api/x402/resource',{}, {config:readX402Config({}),makeServer:async()=>{
    throw Error('not reached');
  }});
  assert.equal(v.statusCode,503);
  assert.equal(v.data.error,'X402_NOT_CONFIGURED');
});
test('reject sender-as-merchant, non-HTTPS facilitator and invalid configuration',()=>{
  assert.equal(config.configured,true);
  // Correct alphabet and length do not imply a valid Concordium checksum.
  assert.equal(readX402Config({...env,TRUSTGATE_X402_MERCHANT_ADDRESS:'4FmiTW2L4RvCsSVTjFAavYvrgnPLGNj43eiwPYmbhNqtAcMbWW'}).configured,false);
  assert.equal(readX402Config({...env,TRUSTGATE_X402_MERCHANT_ADDRESS:PROOF_CONTEXT.owner}).configured,false);
  assert.equal(readX402Config({...env,TRUSTGATE_X402_FACILITATOR_URL:'http://localhost:3000'}).configured,false);
  assert.equal(readX402Config({...env,TRUSTGATE_X402_REDIS_TOKEN:''}).configured,false);
});
test('supports Vercel Upstash Marketplace credentials without exposing REST secrets',()=>{
  const marketplace = {
    TRUSTGATE_X402_ENABLED:'testnet',
    TRUSTGATE_X402_MERCHANT_ADDRESS:merchant,
    TRUSTGATE_X402_FACILITATOR_URL:'https://sponsor.example.com',
    UPSTASH_REDIS_REST_URL:'https://store.upstash.io',
    UPSTASH_REDIS_REST_TOKEN:'marketplace-secret'
  };
  const result = readX402Config(marketplace);
  assert.equal(result.configured,true);
  assert.equal(result.redisUrl,'https://store.upstash.io');
  assert.equal(result.redisToken,'marketplace-secret');
  const output=publicX402Status(result);
  assert.equal(JSON.stringify(output).includes('marketplace-secret'),false);
  assert.equal(JSON.stringify(output).includes('store.upstash.io'),false);
  assert.equal(readX402Config({...marketplace,UPSTASH_REDIS_REST_TOKEN:''}).configured,false);
});
test('uses paired Redis credentials and never pairs URL from one store with another store token',()=>{
  const mix={
    TRUSTGATE_X402_ENABLED:'testnet',
    TRUSTGATE_X402_MERCHANT_ADDRESS:merchant,
    TRUSTGATE_X402_FACILITATOR_URL:'https://sponsor.example.com',
    TRUSTGATE_X402_REDIS_URL:'https://incorrect.upstash.io',
    UPSTASH_REDIS_REST_TOKEN:'wrong-pair'
  };
  const mixed=readX402Config(mix);
  assert.equal(mixed.configured,false);
  const legacy=readX402Config({...mix,KV_REST_API_URL:'https://kv.upstash.io',KV_REST_API_TOKEN:'kv-secret'});
  assert.equal(legacy.configured,true);
  assert.equal(legacy.redisUrl,'https://kv.upstash.io');
  assert.equal(legacy.redisToken,'kv-secret');
});
test('signed scope binds price in microCCD, payee, chain and resource (not USD)',()=>{
  const intent=makeIntent();
  assert.equal(validateX402Intent(intent,config,NOW).ok,true);
  assert.match(buildX402SignedMessage(intent),/THIS IS NOT A PAYMENT OR TRANSFER SIGNATURE/);
  assert.match(buildX402SignedMessage(intent),/AmountMicroCCD: 100000/);
  for(const change of [
    {network:'eip155:1'},{payTo:PROOF_CONTEXT.owner},{amountMicroCcd:'100001'},
    {resource:'/other'}, {issuedAt:NOW-100000}
  ]){
    assert.equal(validateX402Intent({...intent,...change},config,NOW).ok,false);
  }
});
test('quote is protocol metadata only and cannot execute transfers',async()=>{
  const r=await call('/api/x402/quote');
  assert.equal(r.statusCode,200);
  assert.equal(r.data.mode,'TESTNET_QUOTE_ONLY');
  assert.equal(r.data.amountMicroCcd,'100000');
  assert.equal(r.data.paymentRequired.accepts[0].network,X402_TESTNET);
});
test('no signed payment intent means protected resource is inaccessible',async()=>{
  const r=await call('/api/x402/resource');
  assert.equal(r.statusCode,401);
  assert.equal(r.data.error,'SIGNED_PAYMENT_INTENT_REQUIRED');
});
test('bad owner signature and revoked badge deny BEFORE payment challenge',async()=>{
  const bad=await call('/api/x402/resource',{'x-trustgate-intent':auth()},{
    verifySignature:async()=>false
  });
  assert.equal(bad.statusCode,403);
  assert.equal(bad.data.error,'INVALID_OWNER_SIGNATURE');
  const revoked=await call('/api/x402/resource',{'x-trustgate-intent':auth()},{
    verifyBadge:async()=>({ok:false})
  });
  assert.equal(revoked.statusCode,403);
  assert.equal(revoked.data.error,'AGENT_BADGE_NOT_VERIFIED');
});
test('valid signed owner identity receives real HTTP 402 challenge, not free resource',async()=>{
  const res=await call('/api/x402/resource',{'x-trustgate-intent':auth()});
  assert.equal(res.statusCode,402);
  assert.ok(res.headers['PAYMENT-REQUIRED']);
  const json=JSON.parse(Buffer.from(res.headers['PAYMENT-REQUIRED'],'base64').toString('utf8'));
  assert.equal(json.accepts[0].payTo,merchant);
  assert.equal(json.accepts[0].extra.feePayer,requirements.extra.feePayer);
});
test('wrong recipient/payment amount or chain rejected without settlement',async()=>{
  let calls=0;
  const r=await call('/api/x402/resource',{'x-trustgate-intent':auth(),
    'payment-signature':wire({...payment(),accepted:{...requirements,amount:'100001'}})},{
    makeServer:makeOffer({settlePayment:async()=>{calls++;throw Error('unsafe');}})
  });
  assert.equal(r.statusCode,402);
  assert.equal(r.data.error,'PAYMENT_REQUIREMENTS_MISMATCH');
  assert.equal(calls,0);
});
test('facilitator invalid payment cannot be settled',async()=>{
  let calls=0;
  const r=await call('/api/x402/resource',{'x-trustgate-intent':auth(),'payment-signature':wire()},{
    makeServer:makeOffer({
      verifyPayment:async()=>({isValid:false,invalidReason:'signature_invalid'}),
      settlePayment:async()=>{calls++;throw Error('not allowed');}
    })
  });
  assert.equal(r.statusCode,402);
  assert.equal(r.data.error,'PAYMENT_INVALID');
  assert.equal(calls,0);
});
test('successful settlement and durable store required for paid access',async()=>{
  let consumed=0;
  const r=await call('/api/x402/resource',{'x-trustgate-intent':auth(),'payment-signature':wire()},{
    reserve:async()=>({ok:true,keys:{intentKey:'a',paymentKey:'b'}}),
    markSettled:async()=>{consumed++;return true;}
  });
  assert.equal(r.statusCode,200);
  assert.equal(r.data.kind,'PAID_VERIFIED_AGENT_EVIDENCE');
  assert.equal(r.data.transaction,'b'.repeat(64));
  assert.equal(consumed,1);
  assert.ok(r.headers['PAYMENT-RESPONSE']);
});
test('replayed signed intent or unavailable durable store prevents settlement',async()=>{
  let settlementCalls=0;
  for(const reserve of [
    async()=>({ok:false,code:'INTENT_REPLAY_OR_IN_PROGRESS'}),
    async()=>{throw Error('kv outage');}
  ]){
    const r=await call('/api/x402/resource',{'x-trustgate-intent':auth(),'payment-signature':wire()},{
      reserve,makeServer:makeOffer({settlePayment:async()=>{settlementCalls++;throw Error('unsafe');}})
    });
    assert.ok([409,503].includes(r.statusCode));
  }
  assert.equal(settlementCalls,0);
});
test('atomic Upstash EVAL reserves both keys or neither key', async()=>{
  const commands=[];
  const fake=async(_url,options)=>{
    const cmd=JSON.parse(options.body);commands.push(cmd);
    return {ok:true,json:async()=>({result:commands.length===1?1:0})};
  };
  const accepted=await reserveX402Payment(config,makeIntent(),payment(),fake);
  assert.equal(accepted.ok,true);
  const refused=await reserveX402Payment(config,makeIntent(),payment(),fake);
  assert.equal(refused.ok,false);
  assert.equal(refused.code,'INTENT_OR_PAYMENT_REPLAY');
  assert.equal(commands.length,2);
  for(const cmd of commands){
    assert.equal(cmd[0],'EVAL');
    assert.equal(cmd[1],RESERVE_LUA);
    assert.equal(cmd[2],'2');
    assert.equal(cmd.length,8);
    assert.equal(cmd[5],'IN_PROGRESS');
    assert.equal(cmd[6],'86400');
  }
  const keys=replayKeys(makeIntent(),payment());
  assert.notEqual(keys.intentKey,keys.paymentKey);
});
test('atomic settlement transition requires both keys reserved and matching',async()=>{
  const keys=replayKeys(makeIntent(),payment());
  const calls=[];
  const fake=async(_url,options)=>{
    calls.push(JSON.parse(options.body));
    return {ok:true,json:async()=>({result:calls.length===1?1:0})};
  };
  const hash='b'.repeat(64);
  assert.equal(await markX402Settled(config,keys,hash,fake),true);
  await assert.rejects(markX402Settled(config,keys,hash,fake),/SETTLEMENT_PERSISTENCE_FAILED/);
  assert.equal(calls.length,2);
  const cmd=calls[0];
  assert.equal(cmd[0],'EVAL');
  assert.equal(cmd[1],MARK_SETTLED_LUA);
  assert.equal(cmd[2],'2');
  assert.equal(cmd[5],'IN_PROGRESS');
  assert.equal(cmd[6],JSON.stringify({status:'SETTLED',transaction:hash}));
  assert.equal(cmd[7],'604800');
});
test('Redis unavailable or indeterminate EVAL blocks settlement, no accidental success',async()=>{
  for (const response of [
    {ok:false},
    {ok:true,json:async()=>({result:undefined})},
    {ok:true,json:async()=>({error:'unknown command EVAL'})}
  ]) {
    await assert.rejects(
      reserveX402Payment(config,makeIntent(),payment(),async()=>response)
    );
  }
  const keys=replayKeys(makeIntent(),payment());
  await assert.rejects(markX402Settled(config,keys,'bad',async()=>({ok:true})),/INVALID_SETTLEMENT_RECORD/);
});
test('x402 SDK is installed and exposes the official server and Concordium scheme',async()=>{
  const [{x402ResourceServer,HTTPFacilitatorClient},{ExactConcordiumScheme}] = await Promise.all([
    import('@x402/core/server'),import('@x402/concordium/exact/server')
  ]);
  assert.equal(typeof x402ResourceServer,'function');
  assert.equal(typeof HTTPFacilitatorClient,'function');
  assert.equal(typeof ExactConcordiumScheme,'function');
  const scheme=new ExactConcordiumScheme();
  const price=await scheme.parsePrice({asset:'CCD',amount:'100000'},X402_TESTNET);
  assert.equal(price.amount,'100000');
  assert.equal(price.asset,'CCD');
});
