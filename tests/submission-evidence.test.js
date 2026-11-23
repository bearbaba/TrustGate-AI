import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {
  TRUSTGATE_PUBLIC_EVIDENCE, evaluateSubmissionEvidence, inspectPublicSubmission
} from '../scripts/verify-submission-evidence.mjs';

const E=TRUSTGATE_PUBLIC_EVIDENCE;
const bytes=Buffer.from('{"agent":"test fixture, not a production card"}');
const expected={...E,cardSha256:createHash('sha256').update(bytes).digest('hex')};
const gateway={status:'CONFIGURED_NOT_PAYMENT_TESTED',prerequisites:[],
  network:E.network,merchant:E.merchant,ownerAgent:1323,x402SettlementConfirmed:false};
const sponsor={status:'CONFIGURED_UNTESTED',prerequisites:[],network:E.network,
  sponsor:E.sponsor,actualSettlementVerified:false};
const quote={mode:'TESTNET_QUOTE_ONLY',network:E.network,amountMicroCcd:E.amount,
  asset:'CCD',payTo:E.merchant,paymentRequired:{x402Version:2,
    resource:{url:E.origin+'/api/x402/resource'},accepts:[{scheme:'exact',
      network:E.network,payTo:E.merchant,amount:E.amount,asset:'CCD',
      extra:{feePayer:E.sponsor}}]}};
const snapshot=()=>({cardBytes:bytes,gateway,quote,sponsor});
const assess=s=>evaluateSubmissionEvidence(s,expected);

test('strict public Testnet evidence matches fee, Sponsor, owner and pinned Card',()=>{
  const r=assess(snapshot());
  assert.equal(r.ok,true);
  assert.deepEqual(r.failed,[]);
  assert.equal(Object.keys(r.checks).length,9);
  assert.equal(r.x402SettlementIndependentlyVerified,false);
  assert.equal(r.paidResourceDelivered,false);
});

test('card tampering, merchant swap, wrong network and fake payment claims fail',()=>{
  const samples=[
    [{...snapshot(),cardBytes:Buffer.from('forgery')},'pinnedCardHash'],
    [{...snapshot(),gateway:{...gateway,merchant:E.sponsor}},'merchantBound'],
    [{...snapshot(),quote:{...quote,network:'ccd:wrong'}},'concordiumTestnet'],
    [{...snapshot(),sponsor:{...sponsor,actualSettlementVerified:true}},'noSettlementClaim'],
    [{...snapshot(),quote:{...quote,paymentRequired:{...quote.paymentRequired,
      accepts:[{...quote.paymentRequired.accepts[0],amount:'100001'}]}}},'exactCcdQuote'],
  ];
  for(const [input,field] of samples){
    const r=assess(input);
    assert.equal(r.ok,false);
    assert.ok(r.failed.includes(field));
    assert.equal(r.transactionSubmitted,false);
    assert.equal(r.x402SettlementIndependentlyVerified,false);
  }
});

test('inspector makes only four read-only GETs; no wallet, paid API or RPC',async()=>{
  const fixtures=[bytes,gateway,quote,sponsor];
  const paths=['/.well-known/agent-card.json','/api/x402/status',
    '/api/x402/quote','/api/sponsor/status'];
  const calls=[];
  const res=await inspectPublicSubmission({expected,fetchImpl:async (url,opt)=>{
    calls.push({url,opt});
    const index=paths.indexOf(url.slice(expected.origin.length));
    assert.ok(index>=0);
    assert.equal(opt.method,'GET');
    return {ok:true,arrayBuffer:async()=>{
      const value=fixtures[index];
      return Buffer.from(Buffer.isBuffer(value)?value:JSON.stringify(value));
    }};
  }});
  assert.equal(res.ok,true);
  assert.equal(calls.length,4);
  assert.equal(new Set(calls.map(x=>x.url)).size,4);
  assert.ok(!calls.some(x=>/account|verify|settle|browser-prepare|resource/.test(x.url)));
});

test('untrusted HTML and non-200 public responses never pass',async()=>{
  const fetchImpl=async()=>({ok:true,arrayBuffer:async()=>Buffer.from('<html>login</html>')});
  await assert.rejects(inspectPublicSubmission({expected,fetchImpl}),/INVALID_PUBLIC_JSON/);
  await assert.rejects(inspectPublicSubmission({expected,
    fetchImpl:async()=>({ok:false,status:503})}),/HTTP_503/);
});
