import { PROOF_CONTEXT } from './proof-message.js';
import { AccountAddress } from '@concordium/web-sdk';

export const X402_TESTNET = 'ccd:4221332d34e1694168c2a0c0b3fd0f27';
export const X402_RESOURCE = '/api/x402/resource';
export const X402_PRICE_MICROCCD = '100000'; // 0.1 TESTNET CCD; NOT 0.1 USD
const ACCOUNT = /^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{45,55}$/;

function validMerchantAddress(value) {
  if (!ACCOUNT.test(value)) return false;
  try {
    // Base58 characters/length alone are insufficient; validate checksum
    // through the official Concordium SDK.
    AccountAddress.fromBase58(value);
    return true;
  } catch {
    return false;
  }
}

function validHttps(value) {
  if (typeof value !== 'string' || value.length > 220) return false;
  try {
    const url = new URL(value);
    const firstParty = url.origin === 'https://trustgate-ai.vercel.app' &&
      url.pathname === '/api/sponsor';
    if (url.protocol !== 'https:' || url.username || url.password ||
        url.search || url.hash ||
        (url.pathname !== '/' && !firstParty) || url.port) return false;
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(url.hostname)) return false;
    if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.)/i.test(url.hostname)) return false;
    return true;
  } catch { return false; }
}

export function readX402Config(env = process.env) {
  const enabled = env.TRUSTGATE_X402_ENABLED === 'testnet';
  const merchant = (env.TRUSTGATE_X402_MERCHANT_ADDRESS || '').trim();
  const facilitatorUrl = (env.TRUSTGATE_X402_FACILITATOR_URL || '').trim();
  // First-party hosted sponsor requires a shared token to prevent arbitrary
  // external calls to the gas-paying signing service.
  const ownFacilitator = facilitatorUrl === 'https://trustgate-ai.vercel.app/api/sponsor';
  const facilitatorAuthToken=ownFacilitator?
    (env.TRUSTGATE_FACILITATOR_AUTH_TOKEN||'').trim():
    (env.TRUSTGATE_X402_FACILITATOR_AUTH_TOKEN||'').trim();
  // The Vercel/Upstash Marketplace injects a paired REST URL/token using
  // UPSTASH_REDIS_REST_* (or legacy KV_REST_API_*). Never mix credentials
  // from different stores. Explicit TrustGate credentials take precedence
  // only when both values exist.
  const stores = [
    [env.TRUSTGATE_X402_REDIS_URL, env.TRUSTGATE_X402_REDIS_TOKEN],
    [env.UPSTASH_REDIS_REST_URL, env.UPSTASH_REDIS_REST_TOKEN],
    [env.KV_REST_API_URL, env.KV_REST_API_TOKEN]
  ];
  const selected = stores.find(pair => pair.every(v => typeof v === 'string' && v.trim().length > 0));
  const redisUrl = selected ? selected[0].trim() : '';
  const redisToken = selected ? selected[1].trim() : '';
  const merchantValid = validMerchantAddress(merchant) && merchant !== PROOF_CONTEXT.owner;
  const missing = [];
  if (!enabled) missing.push('ENABLE_TESTNET_GATEWAY');
  if (!merchantValid) missing.push('SEPARATE_MERCHANT_ACCOUNT');
  if (!validHttps(facilitatorUrl)) missing.push('HTTPS_CONCORDIUM_FACILITATOR');
  if (ownFacilitator && !/^[a-zA-Z0-9._~-]{32,256}$/.test(facilitatorAuthToken))
    missing.push('FACILITATOR_AUTH_NOT_CONFIGURED');
  if (!validHttps(redisUrl) || !redisToken) missing.push('DURABLE_ATOMIC_REPLAY_STORE');
  return {
    configured: missing.length === 0, missing,
    network: X402_TESTNET,
    merchant: merchantValid ? merchant : null,
    asset:'CCD', amountMicroCcd:X402_PRICE_MICROCCD,
    facilitatorUrl, facilitatorAuthToken, redisUrl, redisToken,
    resource:X402_RESOURCE
  };
}

export function publicX402Status(config) {
  return {
    status:config.configured ? 'CONFIGURED_NOT_PAYMENT_TESTED' : 'LOCKED_UNTIL_CONFIGURED',
    network: config.network, asset:config.asset,
    priceMicroCcd:config.amountMicroCcd,
    displayPrice:'0.1 TESTNET CCD', merchant:config.merchant,
    prerequisites: config.missing,
    ownerAgent:1323, resource:config.resource,
    x402SettlementConfirmed:false,
    notice:'No payment is triggered by this status endpoint. Payment access is disabled unless merchant, sponsored facilitator and atomic replay store are configured. Actual settlement requires separate wallet authorization.'
  };
}

export function buildX402SignedMessage(intent) {
  return [
    'TrustGate AI - scoped Testnet payment access intent',
    'THIS IS NOT A PAYMENT OR TRANSFER SIGNATURE',
    'Origin: https://trustgate-ai.vercel.app',
    'Version: trustgate-x402-intent/v1',
    'Network: '+intent.network,
    'Badge: '+intent.badge,
    'OwnerAccount: '+intent.account,
    'Resource: '+intent.resource,
    'Merchant: '+intent.payTo,
    'Asset: CCD',
    'AmountMicroCCD: '+intent.amountMicroCcd,
    'Nonce: '+intent.nonce,
    'IssuedAt: '+intent.issuedAt
  ].join('\n');
}

export function validateX402Intent(input, config, now=Date.now()) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {ok:false,code:'INVALID_INTENT'};
  const valid = input.version === 'trustgate-x402-intent/v1' &&
    input.network === X402_TESTNET &&
    input.badge === PROOF_CONTEXT.badge && input.account === PROOF_CONTEXT.owner &&
    input.resource === X402_RESOURCE &&
    input.payTo === config.merchant && config.merchant !== null &&
    input.asset === 'CCD' && input.amountMicroCcd === config.amountMicroCcd &&
    typeof input.nonce === 'string' && /^[a-f0-9]{32}$/.test(input.nonce) &&
    Number.isSafeInteger(input.issuedAt) && input.issuedAt <= now + 5000 &&
    now - input.issuedAt >= 0 && now - input.issuedAt <= 90000 &&
    !!input.signature && typeof input.signature === 'object' && !Array.isArray(input.signature) &&
    JSON.stringify(input.signature).length <= 5000;
  if(!valid)return {ok:false,code:'INVALID_OR_EXPIRED_PAYMENT_INTENT'};
  return {ok:true,intent:{
    version:input.version,network:input.network,badge:input.badge,account:input.account,
    resource:input.resource,payTo:input.payTo,asset:input.asset,
    amountMicroCcd:input.amountMicroCcd,nonce:input.nonce,issuedAt:input.issuedAt
  }};
}
