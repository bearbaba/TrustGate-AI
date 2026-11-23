/**
 * Public-only Concordium hackathon evidence smoke check.
 * Four GETs, no wallet prompts, signatures, Sponsor /supported, account RPC,
 * CCD movement or writes. Run intentionally, never on a timer.
 */
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';

export const TRUSTGATE_PUBLIC_EVIDENCE = Object.freeze({
  origin:'https://trustgate-ai.vercel.app',
  cardSha256:'ed33956577d378ef0bfd537505863d846a2c130513302a2d45d99e5bfc009c44',
  network:'ccd:4221332d34e1694168c2a0c0b3fd0f27',
  merchant:'4XYepvZZJyFkKTTgoTCmNuQYar1PBiscdZBh6cRotsG2Y7SBDf',
  sponsor:'4Q9ZNet1wKBCS3HWYxBSrHjKPfyois52h3gYUUHKe8Fw4Cf3s3',
  amount:'100000',
  agentId:1323
});

export function evaluateSubmissionEvidence({cardBytes,gateway,quote,sponsor},
  expected=TRUSTGATE_PUBLIC_EVIDENCE) {
  if(!Buffer.isBuffer(cardBytes) || cardBytes.length>1024*1024)
    throw Error('INVALID_PUBLIC_AGENT_CARD_BYTES');
  const hash=createHash('sha256').update(cardBytes).digest('hex');
  const payment=quote?.paymentRequired;
  const accept=Array.isArray(payment?.accepts)?payment.accepts[0]:null;
  const checks={
    pinnedCardHash:hash===expected.cardSha256,
    gatewayConfigured:gateway?.status==='CONFIGURED_NOT_PAYMENT_TESTED' &&
      Array.isArray(gateway.prerequisites) && gateway.prerequisites.length===0,
    sponsorConfigured:sponsor?.status==='CONFIGURED_UNTESTED' &&
      Array.isArray(sponsor.prerequisites) && sponsor.prerequisites.length===0,
    agentIdentity:gateway?.ownerAgent===expected.agentId,
    concordiumTestnet:gateway?.network===expected.network &&
      sponsor?.network===expected.network && quote?.network===expected.network,
    merchantBound:gateway?.merchant===expected.merchant &&
      quote?.payTo===expected.merchant && accept?.payTo===expected.merchant,
    sponsorBound:sponsor?.sponsor===expected.sponsor &&
      accept?.extra?.feePayer===expected.sponsor,
    exactCcdQuote:quote?.mode==='TESTNET_QUOTE_ONLY' &&
      quote?.amountMicroCcd===expected.amount &&
      quote?.asset==='CCD' && payment?.x402Version===2 &&
      accept?.scheme==='exact' && accept?.network===expected.network &&
      accept?.amount===expected.amount && accept?.asset==='CCD' &&
      payment?.resource?.url===expected.origin+'/api/x402/resource',
    noSettlementClaim:gateway?.x402SettlementConfirmed===false &&
      sponsor?.actualSettlementVerified===false
  };
  const failed=Object.entries(checks).filter(([,ok])=>!ok).map(([name])=>name);
  return {
    kind:'TRUSTGATE_PUBLIC_SUBMISSION_PREFLIGHT_V1',
    ok:failed.length===0,
    checks,failed,
    pinnedAgentCardSha256:hash,
    transactionSubmitted:false,
    x402SettlementIndependentlyVerified:false,
    paidResourceDelivered:false,
    note:'Read-only public metadata and quote verification. NOT an on-chain payment receipt, wallet authorization, historical issuance proof, or audit.'
  };
}

async function readPublic(path,{fetchImpl,origin}) {
  const response=await fetchImpl(origin+path,{
    method:'GET',redirect:'error',cache:'no-store',
    signal:AbortSignal.timeout(8000),
    headers:{'Accept':'application/json'}
  });
  if(!response.ok)throw Error('PUBLIC_ENDPOINT_HTTP_'+response.status+': '+path);
  const data=Buffer.from(await response.arrayBuffer());
  if(data.length>1024*1024)throw Error('PUBLIC_RESPONSE_TOO_LARGE: '+path);
  return data;
}

export async function inspectPublicSubmission({fetchImpl=fetch,expected=TRUSTGATE_PUBLIC_EVIDENCE}={}) {
  const paths=['/.well-known/agent-card.json','/api/x402/status',
    '/api/x402/quote','/api/sponsor/status'];
  const results=await Promise.all(paths.map(path=>readPublic(path,{
    fetchImpl,origin:expected.origin
  })));
  const [cardBytes,...body]=results;
  const decoded=body.map((b,i)=>{
    try{return JSON.parse(b.toString('utf8'));}
    catch{throw Error('INVALID_PUBLIC_JSON: '+paths[i+1]);}
  });
  return evaluateSubmissionEvidence({cardBytes,gateway:decoded[0],
    quote:decoded[1],sponsor:decoded[2]},expected);
}

if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
  if(process.argv.length!==3 || process.argv[2]!=='--live'){
    console.error('Usage: node scripts/verify-submission-evidence.mjs --live');
    process.exitCode=2;
  } else {
    try{
      const result=await inspectPublicSubmission();
      console.log(JSON.stringify({...result,checkedAt:new Date().toISOString()},null,2));
      if(!result.ok)process.exitCode=1;
    }catch(error){
      console.error('Read-only submission preflight failed:',error.message);
      process.exitCode=1;
    }
  }
}
