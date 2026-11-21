import {
  AccountAddress,CcdAmount,TransactionExpiry,buildBasicAccountSigner
} from '@concordium/web-sdk';
import { Transaction } from '@concordium/web-sdk/transactions';
import { ConcordiumGRPCNodeClient } from '@concordium/web-sdk/nodejs';
import { credentials } from '@grpc/grpc-js';
import { readX402Config, X402_TESTNET } from './x402-config.js';
import { readSponsorConfig } from './x402-facilitator.js';
import { verifyPaymentIntent } from './x402-gateway.js';
import { inspectSponsorAccounts, sponsorCanProceed } from './x402-chain-readiness.js';
import { inspectSponsorSigningAuthority } from './x402-sponsor-authority.js';
import { enforceSponsorRateLimit } from './x402-sponsor-limiter.js';
import { reserveX402Payment } from './x402-store.js';
import { getAccountInfo } from './live-proof.js';
import { PROOF_CONTEXT } from './proof-message.js';

/**
 * Concordium Wallet for Web signs the SENDER portion of sponsor-first V1
 * transactions with sendSponsoredTransaction. This is a native browser-wallet
 * route, NOT an @x402/concordium/exact/client sender-first PAYMENT-SIGNATURE.
 * It is disabled unless all first-party Sponsor and gateway guards are ready.
 */
let grpcClient;
const CAVEAT='Native Concordium Wallet sponsored Testnet transaction, not a completed x402 exact paid-resource settlement. The wallet must still review, sign and submit.';

export async function prepareSponsoredCcdTransaction(config, intent, deps={}) {
  const fetchNonce=deps.fetchNonce||async account=>{
    if(!grpcClient) grpcClient=new ConcordiumGRPCNodeClient(
      'grpc.testnet.concordium.com',20000,credentials.createSsl(),{timeout:10000}
    );
    return (await grpcClient.getNextAccountNonce(AccountAddress.fromBase58(account))).nonce;
  };
  const nonce=await fetchNonce(intent.account);
  const expires=Math.floor(Date.now()/1000)+75;
  const signable=Transaction.transfer({
    toAddress:AccountAddress.fromBase58(config.merchant),
    amount:CcdAmount.fromMicroCcd(100000n)
  }).addMetadata({
    sender:AccountAddress.fromBase58(PROOF_CONTEXT.owner),
    nonce,
    expiry:TransactionExpiry.fromEpochSeconds(expires)
  }).addSponsor(AccountAddress.fromBase58(config.address)).build();
  // Only Sponsor signs here; the registered owner signs and submits with
  // provider.sendSponsoredTransaction in the browser. Never return the seed.
  const signer=(deps.buildSigner||buildBasicAccountSigner)(config.privateKey);
  const sponsorSigned=await (deps.sponsorTransaction||Transaction.sponsor)(signable,signer);
  const signedJson=(deps.serializeTransaction||Transaction.toJSON)(sponsorSigned);
  return JSON.parse(JSON.stringify(signedJson,(_key,value)=>{
    if(typeof value!=='bigint')return value;
    return value<=BigInt(Number.MAX_SAFE_INTEGER) &&
      value>=BigInt(Number.MIN_SAFE_INTEGER)?Number(value):value.toString();
  }));
}

export async function handleBrowserSponsoredPrepare(req,res,deps={}) {
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='POST')return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
  if(!String(req.headers?.['content-type']||'').toLowerCase().startsWith('application/json'))
    return res.status(415).json({error:'JSON_REQUIRED'});
  let size;
  try{size=Buffer.byteLength(JSON.stringify(req.body));}
  catch{return res.status(400).json({error:'INVALID_BODY'});}
  if(size>10000)return res.status(413).json({error:'BODY_TOO_LARGE'});

  const gateway=deps.gatewayConfig||readX402Config();
  const sponsor=deps.sponsorConfig||readSponsorConfig();
  if(!gateway.configured||!sponsor.configured||
     sponsor.merchant!==gateway.merchant || sponsor.network!==X402_TESTNET){
    return res.status(503).json({error:'WALLET_SPONSORED_CHECKOUT_LOCKED'});
  }
  const raw=req.body?.intent;
  const checked=await (deps.verifyIntent||verifyPaymentIntent)(raw,gateway);
  if(!checked?.ok)return res.status(403).json({error:checked?.code||'OWNER_INTENT_NOT_VERIFIED'});
  const intent=checked.intent;
  let state;
  try{
    state=await (deps.inspectAccounts||inspectSponsorAccounts)(sponsor);
    if(!sponsorCanProceed(state))throw Error('SPONSOR_ACCOUNT_NOT_READY');
    const authority=await (deps.inspectSigningAuthority||inspectSponsorSigningAuthority)(sponsor);
    if(authority?.ok!==true)throw Error('SPONSOR_KEY_UNVERIFIED');
    const payer=await (deps.lookupOwner||getAccountInfo)(PROOF_CONTEXT.owner);
    if(BigInt(CcdAmount.toMicroCcd(payer.accountAvailableBalance).toString()) < 100000n){
      return res.status(409).json({error:'OWNER_TESTNET_CCD_INSUFFICIENT'});
    }
  }catch{return res.status(503).json({error:'WALLET_SPONSOR_PREFLIGHT_FAILED'});}

  // Shared Redis quota: 2 preparation attempts per minute, max 4/day.
  // A wallet approval may still be declined and no money is spent.
  try{
    if(!await (deps.rateLimit||enforceSponsorRateLimit)(sponsor,'prepare'))
      return res.status(429).json({error:'SPONSOR_PREPARE_RATE_LIMITED'});
  }catch{return res.status(503).json({error:'SPONSOR_PREPARE_LIMITER_UNAVAILABLE'});}

  // Lock each owner-signed nonce before issuing any sponsor-signed transaction.
  // One signed access intent can never generate repeated sponsor commitments.
  const paymentMarker={
    kind:'NATIVE_CONCORDIUM_BROWSER_SPONSORED_V1',
    owner:intent.account,merchant:sponsor.merchant,
    sponsor:sponsor.address,amountMicroCcd:'100000'
  };
  let reserved;
  try{
    reserved=await (deps.reserve||reserveX402Payment)(gateway,intent,paymentMarker);
  }catch{return res.status(503).json({error:'SPONSOR_PREPARE_REPLAY_STORE_UNAVAILABLE'});}
  if(!reserved?.ok)return res.status(409).json({error:'SPONSORED_PREPARE_REPLAY'});

  let sponsoredTransaction;
  try{
    sponsoredTransaction=await (deps.prepare||prepareSponsoredCcdTransaction)(sponsor,intent);
  }catch{
    // Reservation intentionally stays locked after ambiguous signing failure.
    return res.status(503).json({error:'SPONSORED_TRANSACTION_PREPARATION_FAILED',
      manualReconciliationRequired:true});
  }
  return res.status(200).json({
    kind:'NATIVE_WALLET_SPONSORED_PREPARED_V1',
    network:X402_TESTNET,amountMicroCcd:'100000',
    owner:PROOF_CONTEXT.owner,merchant:sponsor.merchant,
    sponsor:sponsor.address,sponsoredTransaction,
    notice:CAVEAT
  });
}
