import { createHash } from 'node:crypto';
import { AccountAddress, verifyMessageSignature } from '@concordium/web-sdk';
import { getAccountInfo } from '../lib/live-proof.js';
import { verifyBadge } from '../lib/concordium.js';
import { PROOF_CONTEXT } from '../lib/proof-message.js';
import {
  readX402Config, publicX402Status, validateX402Intent, buildX402SignedMessage, X402_TESTNET
} from '../lib/x402-config.js';
import { makeConcordiumX402Server } from '../lib/x402-sdk.js';
import { reserveX402Payment, markX402Settled } from '../lib/x402-store.js';
import { verifyFinalizedConcordiumPayment } from './x402-settlement-proof.js';

function readB64Json(header,maxLength=14000) {
  if(typeof header!=='string'||header.length>maxLength||!header.length ||
     !/^[a-zA-Z0-9+/]+={0,2}$/.test(header))return null;
  try{return JSON.parse(Buffer.from(header,'base64').toString('utf8'));}
  catch{return null;}
}

async function verifyPaymentIntent(raw,config,deps={}) {
  const checked=validateX402Intent(raw,config,deps.now??Date.now());
  if(!checked.ok)return {ok:false,code:checked.code};
  const intent=checked.intent;
  let authorized;
  try{
    const info=await (deps.accountLookup||getAccountInfo)(intent.account);
    authorized=await (deps.verifySignature||verifyMessageSignature)(
      buildX402SignedMessage(intent),raw.signature,info
    );
  }catch{return {ok:false,code:'OWNER_SIGNATURE_UNAVAILABLE'};}
  if(authorized!==true)return {ok:false,code:'INVALID_OWNER_SIGNATURE'};
  let badge;
  try{badge=await (deps.verifyBadge||verifyBadge)(intent.badge);}
  catch{badge={ok:false};}
  if(!badge?.ok||badge.checks?.tokenId!==1323 ||
     badge.checks?.ownerAccount!==PROOF_CONTEXT.owner||
     badge.checks?.status!=='Active'||badge.checks?.hashMatchesOnChain!==true) {
    return {ok:false,code:'AGENT_BADGE_NOT_VERIFIED'};
  }
  return {ok:true,intent,badge};
}

export async function handleX402(req,res,deps={}) {
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  const path=deps.path||'/api/x402/resource';
  const config=deps.config||readX402Config();
  if(req.method!=='GET')return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
  if(path==='/api/x402/status')return res.status(200).json(publicX402Status(config));
  if(!config.configured) return res.status(503).json({
    error:'X402_NOT_CONFIGURED',...publicX402Status(config)
  });
  let offer;
  try{offer=await (deps.makeServer||makeConcordiumX402Server)(config);}
  catch{return res.status(503).json({error:'X402_FACILITATOR_UNAVAILABLE',
    detail:'Cannot confirm supported Concordium Testnet sponsor and exact CCD requirements.'});}
  if(path==='/api/x402/quote')return res.status(200).json({
    mode:'TESTNET_QUOTE_ONLY',network:config.network,
    amountMicroCcd:config.amountMicroCcd,asset:'CCD',payTo:config.merchant,
    paymentRequired:offer.paymentRequired,
    notice:'Quote only. No payment has been signed, submitted or settled.'
  });

  const authorization=readB64Json(req.headers?.['x-trustgate-intent'],9000);
  if(!authorization)return res.status(401).json({error:'SIGNED_PAYMENT_INTENT_REQUIRED'});
  const verifiedIntent=await verifyPaymentIntent(authorization,config,deps);
  if(!verifiedIntent.ok)return res.status(403).json({error:verifiedIntent.code});
  const intent=verifiedIntent.intent;
  const wire=req.headers?.['payment-signature'];
  if(!wire) {
    res.setHeader('PAYMENT-REQUIRED',Buffer.from(JSON.stringify(offer.paymentRequired)).toString('base64'));
    return res.status(402).json(offer.paymentRequired);
  }
  const payment=readB64Json(wire,16000);
  const accepted=payment?.accepted;
  const r=offer.requirements;
  // The official Concordium exact client sends a signedTransaction object.
  // The sender lives in signedTransaction.header.sender (NOT payload.sender).
  const tx=payment?.payload?.signedTransaction;
  const feePayer=tx?.header?.sponsor?.address||tx?.header?.sponsor?.account;
  if(payment?.x402Version!==2 || tx?.version!==1 ||
     tx?.header?.sender!==PROOF_CONTEXT.owner ||
     feePayer!==r.extra?.feePayer ||
     accepted?.scheme!==r.scheme ||accepted?.network!==X402_TESTNET ||
     accepted?.payTo!==r.payTo || accepted?.amount!==r.amount ||
     accepted?.asset!==r.asset ||
     accepted?.extra?.feePayer!==r.extra?.feePayer)
    return res.status(402).json({error:'PAYMENT_REQUIREMENTS_MISMATCH'});

  // Never settle unless facilitator cryptographically verifies payment.
  let ver;
  try{ver=await offer.server.verifyPayment(payment,r);}
  catch{return res.status(503).json({error:'FACILITATOR_VERIFY_UNAVAILABLE'});}
  if(!ver?.isValid)return res.status(402).json({error:'PAYMENT_INVALID',reason:ver?.invalidReason||null});

  let reserved;
  try{reserved=await (deps.reserve||reserveX402Payment)(config,intent,payment);}
  catch{return res.status(503).json({error:'ATOMIC_REPLAY_STORE_UNAVAILABLE'});}
  if(!reserved?.ok)return res.status(409).json({error:reserved?.code||'PAYMENT_REPLAY'});
  // Safety: an ambiguous settlement leaves the nonce/payment locked. Never
  // attempt to settle the same payload again without on-chain reconciliation.
  let settled;
  try{settled=await offer.server.settlePayment(payment,r);}
  catch{return res.status(503).json({error:'SETTLEMENT_UNKNOWN_RECONCILIATION_REQUIRED'});}
  if(!settled?.success || settled?.network!==X402_TESTNET ||
     typeof settled.transaction!=='string' ||
     !/^[a-f0-9]{64}$/i.test(settled.transaction) ||
     (settled.payer && settled.payer!==PROOF_CONTEXT.owner))
    return res.status(503).json({error:'SETTLEMENT_NOT_CONFIRMED',transaction:
      /^[a-f0-9]{64}$/i.test(settled?.transaction||'')?settled.transaction:null});
  // The settlement response alone is insufficient: fetch the finalized
  // transaction from Concordium Testnet and independently bind it to the
  // original sender, Merchant, Sponsor and exact microCCD amount. If the
  // node is unavailable or any field disagrees, keep Redis reservation in
  // progress for manual reconciliation; never issue paid evidence.
  let finalProof;
  try {
    finalProof=await (deps.verifyFinalizedPayment||
      verifyFinalizedConcordiumPayment)(settled.transaction,r);
  } catch {
    finalProof={ok:false,code:'ONCHAIN_SETTLEMENT_LOOKUP_UNAVAILABLE'};
  }
  if(finalProof?.ok!==true) return res.status(503).json({
    error:finalProof?.code||'ONCHAIN_SETTLEMENT_UNVERIFIED',
    transaction:settled.transaction,
    manualReconciliationRequired:true
  });
  try{await (deps.markSettled||markX402Settled)(config,reserved.keys,settled.transaction);}
  catch{return res.status(503).json({error:'SETTLED_BUT_REPLAY_STORE_UPDATE_FAILED',
    transaction:settled.transaction,manualReconciliationRequired:true});}

  // This is delivered only after real facilitator settlement and atomic
  // reservation. Do not confuse it with the free /api/live-proof receipt.
  res.setHeader('PAYMENT-RESPONSE',Buffer.from(JSON.stringify(settled)).toString('base64'));
  return res.status(200).json({
    kind:'PAID_VERIFIED_AGENT_EVIDENCE',network:X402_TESTNET,
    badge:intent.badge,ownerAccount:intent.account,
    merchant:config.merchant,priceMicroCcd:config.amountMicroCcd,asset:'CCD',
    transaction:settled.transaction,
    transactionExplorer:'https://ccdexplorer.io/testnet/transaction/'+settled.transaction,
    cardSha256:verifiedIntent.badge.checks.cardSha256,
    registryCheckedAt:verifiedIntent.badge.checkedAt,
    nonce:intent.nonce,
    notice:'Finalized exact Testnet CCD transfer independently verified against sender, recipient, amount and Sponsor.'
  });
}
