/**
 * Browser-only, fail-closed readiness evaluator for the native Concordium
 * Wallet sponsor-first flow. Public status responses have no secrets.
 *
 * The button MUST remain disabled until gateway flags, Sponsor flags,
 * on-chain signing authority AND on-chain balances are verified.
 * Server-side preflight is repeated on actual signing.
 */
const BLOCKERS=Object.freeze([
  ['SPONSOR_KEY_SECURELY_CONFIGURED',
    'Sponsor signing key is not configured securely in Vercel. No wallet signature will be requested.'],
  ['SPONSOR_API_AUTH_CONFIGURED',
    'Sponsor API authentication is not configured in Vercel. No wallet signature will be requested.'],
  ['FACILITATOR_DISABLED',
    'The first-party Sponsor facilitator is disabled for Testnet.'],
  ['FACILITATOR_URL_NOT_FIRST_PARTY',
    'First-party Sponsor URL must be configured before checkout can start.'],
  ['ENABLE_TESTNET_GATEWAY',
    'The Testnet Gateway enable flag is not configured.'],
  ['HTTPS_CONCORDIUM_FACILITATOR',
    'A supported HTTPS Concordium facilitator URL and its authorization are required.'],
  ['GATEWAY_SAFETY_PREREQUISITES',
    'Gateway safety prerequisites have not passed.'],
  ['SEPARATE_MERCHANT_ACCOUNT',
    'A distinct Merchant account is required.'],
  ['DURABLE_ATOMIC_REPLAY_STORE',
    'The durable replay-protection database is unavailable or unconfigured.']
]);

export function evaluateWalletSponsorReadiness(gateway,sponsor,accounts=null) {
  if (!gateway || !sponsor || typeof gateway !== 'object' ||
      typeof sponsor !== 'object') {
    return {ready:false,needsAccounts:false,code:'READINESS_UNAVAILABLE',
      message:'Cannot verify Gateway and Sponsor status. Signing is disabled.'};
  }
  const missing=new Set([...(Array.isArray(gateway.prerequisites)?gateway.prerequisites:[]),
    ...(Array.isArray(sponsor.prerequisites)?sponsor.prerequisites:[])]);
  if (gateway.status!=='CONFIGURED_NOT_PAYMENT_TESTED' ||
      sponsor.status!=='CONFIGURED_UNTESTED' || missing.size>0) {
    const blocker=BLOCKERS.find(([code])=>missing.has(code));
    const message=blocker?.[1]||
      'Gateway or Sponsor is not fully configured. No wallet signature will be requested.';
    return {ready:false,needsAccounts:false,
      code:blocker?.[0]||'GATEWAY_OR_SPONSOR_LOCKED',message};
  }
  if (accounts===null) {
    return {ready:false,needsAccounts:true,code:'CHECK_ONCHAIN_SPONSOR',
      message:'Checking funded accounts and Sponsor signing-key ownership on Testnet…'};
  }
  if (accounts.status!=='ACCOUNTS_PRESENT_SPONSOR_HAS_CCD' ||
      accounts.merchantExists!==true || accounts.sponsorExists!==true ||
      accounts.sponsorHasAvailableCcd!==true ||
      typeof accounts.merchant!=='string' || accounts.merchant!==gateway.merchant ||
      !accounts.sponsor || accounts.sponsor===gateway.merchant) {
    return {ready:false,needsAccounts:false,code:'SPONSOR_OR_MERCHANT_NOT_READY',
      message:'Merchant/Sponsor account funding or identity could not be verified on Testnet.'};
  }
  if (accounts.signingKeyVerified!==true) {
    return {ready:false,needsAccounts:false,
      code:accounts.signingKeyStatus||'SPONSOR_KEY_NOT_VERIFIED',
      message:'Sponsor signing authority is not verified on-chain. Checkout remains locked.'};
  }
  if (accounts.network!==gateway.network || sponsor.network!==gateway.network) {
    return {ready:false,needsAccounts:false,code:'NETWORK_MISMATCH',
      message:'Gateway, Sponsor and account checks do not agree on the Testnet network.'};
  }
  return {ready:true,needsAccounts:false,code:'OWNER_REVIEW_READY',
    message:'Sponsor verified. You may initiate a wallet review of exactly 0.1 Testnet CCD. No funds move without your approval.'};
}
