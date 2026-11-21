import { createHash, timingSafeEqual } from 'node:crypto';
import { AccountAddress } from '@concordium/web-sdk';
import { PROOF_CONTEXT } from './proof-message.js';
import { readX402Config, X402_TESTNET } from './x402-config.js';

const MAX_BODY_BYTES=22000;
const SPONSOR_REQUIRED='SPONSOR_NOT_CONFIGURED';
const TOKEN_PATTERN=/^[a-zA-Z0-9._~-]{32,256}$/;
const SPONSOR_ACCOUNT_PATTERN=/^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{45,55}$/;

function validAccount(value) {
  if(typeof value!=='string'||!SPONSOR_ACCOUNT_PATTERN.test(value))return false;
  try{AccountAddress.fromBase58(value);return true;}
  catch{return false;}
}

export function readSponsorConfig(env=process.env) {
  const gateway=readX402Config(env);
  const enabled=env.TRUSTGATE_FACILITATOR_ENABLED==='testnet';
  const address=(env.TRUSTGATE_FACILITATOR_SPONSOR_ADDRESS||'').trim();
  const privateKey=(env.TRUSTGATE_FACILITATOR_SPONSOR_PRIVATE_KEY||'').trim();
  const token=(env.TRUSTGATE_FACILITATOR_AUTH_TOKEN||'').trim();
  const correctAccount=validAccount(address)&&address!==gateway.merchant&&address!==PROOF_CONTEXT.owner;
  const missing=[];
  if(!enabled)missing.push('FACILITATOR_DISABLED');
  if(!correctAccount)missing.push('DISTINCT_TESTNET_SPONSOR_ACCOUNT');
  if(!/^[0-9a-f]{64}$/i.test(privateKey))missing.push('SPONSOR_KEY_SECURELY_CONFIGURED');
  if(!TOKEN_PATTERN.test(token))missing.push('SPONSOR_API_AUTH_CONFIGURED');
  if(!gateway.configured)missing.push('GATEWAY_SAFETY_PREREQUISITES');
  // Only the first-party resource server may call this sponsor. A separate
  // hosted facilitator must have its own isolated token instead.
  const expectedUrl='https://trustgate-ai.vercel.app/api/sponsor';
  if(gateway.facilitatorUrl!==expectedUrl)missing.push('FACILITATOR_URL_NOT_FIRST_PARTY');
  return {
    configured:missing.length===0,missing,address:correctAccount?address:null,
    privateKey,token,merchant:gateway.merchant,network:X402_TESTNET,
    amountMicroCcd:gateway.amountMicroCcd
  };
}

export function publicSponsorStatus(config) {
  return {
    status:config.configured?'CONFIGURED_UNTESTED':'LOCKED_UNTIL_CONFIGURED',
    network:config.network,
    sponsor:config.address,
    prerequisites:config.missing,
    actualSettlementVerified:false,
    note:'An on-chain-funded sponsor key and authorized sender-signed Testnet transaction are required. No payment is triggered by this endpoint.'
  };
}

function validToken(provided,expected) {
  if(typeof provided!=='string'||typeof expected!=='string')return false;
  if(!provided.startsWith('Bearer ')||provided.length>300)return false;
  const candidate=provided.slice(7);
  if(!TOKEN_PATTERN.test(candidate))return false;
  const a=createHash('sha256').update(candidate).digest();
  const b=createHash('sha256').update(expected).digest();
  return timingSafeEqual(a,b);
}

export function validateSponsorPayment(body,config) {
  if(!body||typeof body!=='object'||Array.isArray(body))return false;
  const payment=body.paymentPayload, requirement=body.paymentRequirements;
  const accepted=payment?.accepted;
  const tx=payment?.payload?.signedTransaction;
  const exact=(r)=>!!r && r.scheme==='exact' && r.network===config.network &&
    r.asset==='CCD' && r.amount===config.amountMicroCcd &&
    r.payTo===config.merchant && r.extra?.feePayer===config.address &&
    Number.isSafeInteger(r.maxTimeoutSeconds) && r.maxTimeoutSeconds>0 &&
    r.maxTimeoutSeconds<=90;
  return body.x402Version===2 && payment?.x402Version===2 &&
    exact(requirement) && exact(accepted) &&
    tx?.version===1 && tx?.header?.sender===PROOF_CONTEXT.owner &&
    (tx?.header?.sponsor?.account===config.address ||
     tx?.header?.sponsor?.address===config.address);
}

export async function makeTrustGateFacilitator(config) {
  const [{x402Facilitator},{ExactConcordiumScheme},{
    toConcordiumFacilitatorSigner
  }] = await Promise.all([
    import('@x402/core/facilitator'),
    import('@x402/concordium/exact/facilitator'),
    import('@x402/concordium')
  ]);
  // No keys leave process.env. SDK verifies 9 rules and waits for on-chain
  // finalization before reporting a successful settlement.
  const signer=toConcordiumFacilitatorSigner(config.address,config.privateKey,{
    host:'grpc.testnet.concordium.com',port:20000,useTls:true,network:X402_TESTNET
  });
  const engine=new x402Facilitator();
  engine.register(X402_TESTNET,new ExactConcordiumScheme({
    signer,requireFinalization:true,finalizationTimeoutMs:60000,
    maxExpiryOffsetSeconds:90
  }));
  return engine;
}

export async function handleSponsor(req,res,deps={}) {
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  const path=deps.path||'/api/sponsor/status';
  const config=deps.config||readSponsorConfig();
  if(path==='/api/sponsor/status'){
    if(req.method!=='GET')return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
    return res.status(200).json(publicSponsorStatus(config));
  }
  if(!config.configured)return res.status(503).json({error:SPONSOR_REQUIRED});
  if(!validToken(req.headers?.authorization,config.token))
    return res.status(401).json({error:'SPONSOR_AUTH_REQUIRED'});
  if(path==='/api/sponsor/supported'){
    if(req.method!=='GET')return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
  } else {
    if(req.method!=='POST')return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
    if(!String(req.headers?.['content-type']||'').toLowerCase().startsWith('application/json'))
      return res.status(415).json({error:'JSON_REQUIRED'});
    let size=0;
    try{size=Buffer.byteLength(JSON.stringify(req.body));}
    catch{return res.status(400).json({error:'INVALID_JSON'});}
    if(size>MAX_BODY_BYTES)return res.status(413).json({error:'PAYLOAD_TOO_LARGE'});
    if(!validateSponsorPayment(req.body,config))
      return res.status(403).json({error:'PAYMENT_OUTSIDE_TRUSTGATE_SCOPE'});
  }
  let engine;
  try{engine=await (deps.makeEngine||makeTrustGateFacilitator)(config);}
  catch{return res.status(503).json({error:'SPONSOR_ENGINE_UNAVAILABLE'});}
  if(path==='/api/sponsor/supported')
    return res.status(200).json(engine.getSupported());
  const {paymentPayload,paymentRequirements}=req.body;
  if(path==='/api/sponsor/verify'){
    try{return res.status(200).json(await engine.verify(paymentPayload,paymentRequirements));}
    catch{return res.status(503).json({error:'SPONSOR_VERIFICATION_UNAVAILABLE'});}
  }
  if(path==='/api/sponsor/settle'){
    try{return res.status(200).json(await engine.settle(paymentPayload,paymentRequirements));}
    catch{return res.status(503).json({error:'SETTLEMENT_UNKNOWN_RECONCILIATION_REQUIRED'});}
  }
  return res.status(404).json({error:'NOT_FOUND'});
}
