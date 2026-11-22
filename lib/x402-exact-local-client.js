import {randomBytes} from 'node:crypto';
import {AccountAddress,buildBasicAccountSigner,signMessage} from '@concordium/web-sdk';
import {ExactConcordiumScheme} from '@x402/concordium/exact/client';
import {PROOF_CONTEXT} from './proof-message.js';
import {X402_SCOPE,createUnsignedX402Intent,buildX402SignedMessage,checkX402Challenge} from './x402-client-intent.js';

/**
 * Owner-local payment client for the OFFICIAL sender-first @x402/concordium exact
 * flow, not the distinct browser-wallet sponsor-first checkout.
 * NEVER import this into a Vercel route or browser bundle. The locally supplied
 * owner signer stays on the owner's machine; the facilitator owns the sponsor.
 */
export const EXACT_TESTNET_ORIGIN='https://trustgate-ai.vercel.app';
export const EXACT_TESTNET_MERCHANT='4XYepvZZJyFkKTTgoTCmNuQYar1PBiscdZBh6cRotsG2Y7SBDf';
export const EXACT_TESTNET_SPONSOR='4Q9ZNet1wKBCS3HWYxBSrHjKPfyois52h3gYUUHKe8Fw4Cf3s3';
const RESOURCE='/api/x402/resource';
const OWNER=PROOF_CONTEXT.owner;
const HEX_KEY=/^[a-fA-F0-9]{64}$/;

export function assertExactTestnetOffer(data) {
  const challenge=data?.paymentRequired??data;
  if(!checkX402Challenge(challenge,EXACT_TESTNET_MERCHANT))
    throw Error('OFFICIAL_X402_REQUIREMENTS_INVALID');
  const [r]=challenge.accepts;
  if(r.extra?.feePayer!==EXACT_TESTNET_SPONSOR ||
     challenge.x402Version!==2 ||
     (challenge.resource?.url && challenge.resource.url!==EXACT_TESTNET_ORIGIN+RESOURCE))
    throw Error('OFFICIAL_X402_REQUIREMENTS_CHANGED');
  if(data?.mode && (data.mode!=='TESTNET_QUOTE_ONLY' ||
     data.network!==X402_SCOPE.network || data.amountMicroCcd!==X402_SCOPE.amountMicroCcd ||
     data.asset!=='CCD' || data.payTo!==EXACT_TESTNET_MERCHANT))
    throw Error('OFFICIAL_X402_QUOTE_MISMATCH');
  return challenge;
}

export function createSenderPaymentEnvelope(challenge,signedPayload) {
  assertExactTestnetOffer(challenge);
  const accepted=challenge.accepts[0];
  const tx=signedPayload?.payload?.signedTransaction;
  if(signedPayload.x402Version!==2 || !tx || tx.version!==1 ||
     tx.header?.sender!==OWNER ||
     (tx.header?.sponsor?.account!==EXACT_TESTNET_SPONSOR &&
      tx.header?.sponsor?.address!==EXACT_TESTNET_SPONSOR) ||
     tx.payload?.type!=='transfer' || tx.payload?.toAddress!==EXACT_TESTNET_MERCHANT ||
     tx.payload?.amount!==X402_SCOPE.amountMicroCcd ||
     Object.keys(tx.signatures?.sender||{}).length===0 ||
     Object.keys(tx.signatures?.sponsor||{}).length!==0)
    throw Error('UNSAFE_SENDER_SIGNED_PAYMENT');
  return {
    x402Version:2,
    resource:challenge.resource,
    accepted,
    payload:signedPayload.payload
  };
}

async function requestJson(url,headers={},fetchImpl=fetch) {
  const response=await fetchImpl(url,{method:'GET',headers,cache:'no-store',redirect:'error',
    signal:AbortSignal.timeout(115000)});
  let body;
  try{body=await response.json();}catch{body={error:'INVALID_SERVER_RESPONSE'};}
  return {response,body};
}

export async function inspectExactClientReadiness(fetchImpl=fetch) {
  const [gateway,sponsor,accounts,quote]=await Promise.all([
    requestJson(EXACT_TESTNET_ORIGIN+'/api/x402/status',{},fetchImpl),
    requestJson(EXACT_TESTNET_ORIGIN+'/api/sponsor/status',{},fetchImpl),
    requestJson(EXACT_TESTNET_ORIGIN+'/api/sponsor/accounts',{},fetchImpl),
    requestJson(EXACT_TESTNET_ORIGIN+'/api/x402/quote',{},fetchImpl)
  ]);
  if([gateway,sponsor,accounts,quote].some(x=>x.response.status!==200))
    throw Error('EXACT_GATEWAY_READINESS_UNAVAILABLE');
  if(gateway.body.status!=='CONFIGURED_NOT_PAYMENT_TESTED' ||
     sponsor.body.status!=='CONFIGURED_UNTESTED' ||
     accounts.body.signingKeyVerified!==true ||
     accounts.body.sponsorHasAvailableCcd!==true ||
     accounts.body.merchant!==EXACT_TESTNET_MERCHANT ||
     accounts.body.sponsor!==EXACT_TESTNET_SPONSOR)
    throw Error('EXACT_GATEWAY_OR_SPONSOR_NOT_READY');
  assertExactTestnetOffer(quote.body);
  return {network:X402_SCOPE.network,asset:'CCD',amountMicroCcd:X402_SCOPE.amountMicroCcd,
    merchant:EXACT_TESTNET_MERCHANT,sponsor:EXACT_TESTNET_SPONSOR,
    gatewayReady:true,facilitatorHandshake:true};
}

/**
 * After explicit human approval, this constructs an owner-signed intent and
 * the official sender-only x402 exact payment. Only the server facilitator
 * can add its sponsor signature/broadcast and return a finalized paid resource.
 * A timeout/error after submission is UNKNOWN, never a reason to repeat.
 */
export async function submitExactTestnetPayment({ownerPrivateKey,fetchImpl=fetch,
  createScheme=(wallet)=>new ExactConcordiumScheme(wallet),onStage=()=>{}}) {
  if(!HEX_KEY.test(ownerPrivateKey||''))
    throw Error('OWNER_LOCAL_SIGNER_REQUIRED');
  if(process.env.VERCEL || process.env.CI)
    throw Error('LOCAL_ONLY_SIGNER_ENVIRONMENT_REQUIRED');
  const account=AccountAddress.fromBase58(OWNER);
  const signer=buildBasicAccountSigner(ownerPrivateKey);
  // Confirm the exact Testnet price/sponsor before signing or contacting paid API.
  onStage('Checking live x402 exact requirements');
  await inspectExactClientReadiness(fetchImpl);

  const intent=createUnsignedX402Intent(OWNER,EXACT_TESTNET_MERCHANT,
    randomBytes(16).toString('hex'),Date.now());
  const signature=await signMessage(account,buildX402SignedMessage(intent),signer);
  const intentHeader=Buffer.from(JSON.stringify({...intent,signature})).toString('base64');
  const path=EXACT_TESTNET_ORIGIN+RESOURCE;
  onStage('Requesting signed-owner HTTP 402 challenge (no CCD sent)');
  const challengeResponse=await requestJson(path,{'X-TRUSTGATE-INTENT':intentHeader},fetchImpl);
  if(challengeResponse.response.status!==402)
    throw Error('OFFICIAL_402_NOT_RECEIVED:'+challengeResponse.response.status);
  const challenge=assertExactTestnetOffer(challengeResponse.body);
  const requirements=challenge.accepts[0];
  onStage('Signing official x402 sender-only V1 payment locally (not broadcast)');
  const scheme=createScheme({accountAddress:account,signer});
  const senderSigned=await scheme.createPaymentPayload(2,requirements);
  const envelope=createSenderPaymentEnvelope(challenge,senderSigned);
  const wire=Buffer.from(JSON.stringify(envelope)).toString('base64');

  // No automated replay. If this request fails after dispatch, operator must
  // check Testnet activity before attempting a fresh signature.
  onStage('Sending PAYMENT-SIGNATURE to resource; facilitator verifies, sponsors and settles');
  let settled;
  try {
    settled=await requestJson(path,{
      'X-TRUSTGATE-INTENT':intentHeader,
      'PAYMENT-SIGNATURE':wire
    },fetchImpl);
  }catch{
    throw Error('SETTLEMENT_UNKNOWN_CHECK_OWNER_AND_MERCHANT_TESTNET_HISTORY_BEFORE_RETRY');
  }
  if(settled.response.status!==200 ||
     settled.body.kind!=='PAID_VERIFIED_AGENT_EVIDENCE' ||
     settled.body.ownerAccount!==OWNER ||
     settled.body.merchant!==EXACT_TESTNET_MERCHANT ||
     settled.body.priceMicroCcd!==X402_SCOPE.amountMicroCcd ||
     settled.body.network!==X402_SCOPE.network ||
     typeof settled.body.transaction!=='string' ||
     !/^[a-f0-9]{64}$/i.test(settled.body.transaction)) {
    const safeHash=typeof settled.body.transaction==='string' &&
      /^[a-f0-9]{64}$/i.test(settled.body.transaction)?settled.body.transaction:null;
    const reason=typeof settled.body.error==='string'?settled.body.error:'PAID_RESOURCE_NOT_VERIFIED';
    const error=new Error('X402_SETTLEMENT_NOT_CONFIRMED:'+settled.response.status+':'+reason+
      ':CHECK_TESTNET_HISTORY_BEFORE_RETRY');
    if(safeHash)error.transaction=safeHash;
    throw error;
  }
  return {
    verified:true,network:settled.body.network,transaction:settled.body.transaction,
    merchant:settled.body.merchant,amountMicroCcd:settled.body.priceMicroCcd,
    evidenceKind:settled.body.kind,
    explorer:'https://ccdexplorer.io/testnet/transaction/'+settled.body.transaction,
    grantsPaidResource:true
  };
}
