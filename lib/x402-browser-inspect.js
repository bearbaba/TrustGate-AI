import { readX402Config, X402_TESTNET } from './x402-config.js';
import { readSponsorConfig } from './x402-facilitator.js';
import { enforceSponsorRateLimit } from './x402-sponsor-limiter.js';
import { verifyFinalizedConcordiumPayment } from './x402-settlement-proof.js';

const HASH=/^[a-f0-9]{64}$/i;

/**
 * Read-only explorer for native sponsor-first wallet payments.
 * This proves the supplied hash is a finalized exact CCD transfer involving
 * the registered sender, configured Merchant and Sponsor. It cannot prove
 * which website session originated the transfer and grants NO paid access.
 */
export async function handleBrowserSponsoredInspect(req,res,deps={}) {
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='GET')return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
  const hash=req.query?.hash;
  if(typeof hash!=='string'||!HASH.test(hash))
    return res.status(400).json({error:'INVALID_TRANSACTION_HASH'});
  const gateway=deps.gatewayConfig||readX402Config();
  const sponsor=deps.sponsorConfig||readSponsorConfig();
  if(!gateway.merchant||!sponsor.address||sponsor.merchant!==gateway.merchant||
     sponsor.network!==X402_TESTNET)
    return res.status(503).json({error:'BROWSER_SPONSORED_INSPECT_NOT_CONFIGURED'});
  try{
    if(!await (deps.rateLimit||enforceSponsorRateLimit)(sponsor,'accounts'))
      return res.status(429).json({error:'CHAIN_INSPECTION_RATE_LIMITED'});
  }catch{return res.status(503).json({error:'CHAIN_INSPECTION_RATE_LIMIT_UNAVAILABLE'});}
  const reqs={amount:gateway.amountMicroCcd,payTo:gateway.merchant,
    extra:{feePayer:sponsor.address}};
  let proof;
  try{proof=await (deps.verifyPayment||verifyFinalizedConcordiumPayment)(hash,reqs);}
  catch{proof={ok:false,code:'ONCHAIN_SETTLEMENT_LOOKUP_UNAVAILABLE'};}
  return res.status(200).json({
    network:X402_TESTNET,transaction:hash,
    verified:proof?.ok===true,
    code:proof?.code||'ONCHAIN_SETTLEMENT_UNVERIFIED',
    merchant:gateway.merchant,sponsor:sponsor.address,
    amountMicroCcd:gateway.amountMicroCcd,
    grantsPaidResource:false,
    notice:'Independent on-chain scope check only; not proof of a particular x402 checkout session or paid resource access.'
  });
}
