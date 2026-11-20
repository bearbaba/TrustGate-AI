import { PROOF_CONTEXT } from './proof-message.js';

export const X402_TESTNET = 'ccd:4221332d34e1694168c2a0c0b3fd0f27';
export const X402_RESOURCE = '/api/x402/resource';
export const X402_PRICE_MICROCCD = '100000'; // 0.1 TESTNET CCD; NOT 0.1 USD
const ACCOUNT = /^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{45,55}$/;

function validHttps(value) {
  if (typeof value !== 'string' || value.length > 220) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password ||
        url.search || url.hash || url.pathname !== '/' || url.port) return false;
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(url.hostname)) return false;
    if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.)/i.test(url.hostname)) return false;
    return true;
  } catch { return false; }
}

export function readX402Config(env = process.env) {
  const enabled = env.TRUSTGATE_X402_ENABLED === 'testnet';
  const merchant = (env.TRUSTGATE_X402_MERCHANT_ADDRESS || '').trim();
  const facilitatorUrl = (env.TRUSTGATE_X402_FACILITATOR_URL || '').trim();
  const redisUrl = (env.TRUSTGATE_X402_REDIS_URL || '').trim();
  const redisToken = (env.TRUSTGATE_X402_REDIS_TOKEN || '').trim();
  const missing = [];
  if (!enabled) missing.push('ENABLE_TESTNET_GATEWAY');
  if (!ACCOUNT.test(merchant) || merchant === PROOF_CONTEXT.owner) missing.push('SEPARATE_MERCHANT_ACCOUNT');
  if (!validHttps(facilitatorUrl)) missing.push('HTTPS_CONCORDIUM_FACILITATOR');
  if (!validHttps(redisUrl) || !redisToken) missing.push('DURABLE_ATOMIC_REPLAY_STORE');
  return {
    configured: missing.length === 0, missing,
    network: X402_TESTNET,
    merchant: ACCOUNT.test(merchant) && merchant !== PROOF_CONTEXT.owner ? merchant : null,
    asset:'CCD', amountMicroCcd:X402_PRICE_MICROCCD,
    facilitatorUrl, redisUrl, redisToken,
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
