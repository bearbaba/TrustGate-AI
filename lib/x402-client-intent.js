import { PROOF_CONTEXT } from './proof-message.js';

// Browser-safe, public Testnet scope shared by the read-only wallet challenge
// and server-side signature verifier. No signing credentials are needed.
export const X402_SCOPE = Object.freeze({
  version: 'trustgate-x402-intent/v1',
  network: 'ccd:4221332d34e1694168c2a0c0b3fd0f27',
  resource: '/api/x402/resource',
  asset: 'CCD',
  amountMicroCcd: '100000',
  origin: 'https://trustgate-ai.vercel.app'
});

export function createUnsignedX402Intent(account, merchant, nonce, issuedAt) {
  if (account !== PROOF_CONTEXT.owner) throw Error('WRONG_AGENT_OWNER');
  if (typeof merchant !== 'string' || merchant === account || !merchant) throw Error('INVALID_MERCHANT');
  if (typeof nonce !== 'string' || !/^[a-f0-9]{32}$/.test(nonce)) throw Error('INVALID_NONCE');
  if (!Number.isSafeInteger(issuedAt) || issuedAt < 0) throw Error('INVALID_TIME');
  return {
    version: X402_SCOPE.version, network: X402_SCOPE.network,
    badge: PROOF_CONTEXT.badge, account,
    resource: X402_SCOPE.resource, payTo: merchant,
    asset: X402_SCOPE.asset, amountMicroCcd: X402_SCOPE.amountMicroCcd,
    nonce, issuedAt
  };
}

export function buildX402SignedMessage(intent) {
  return [
    'TrustGate AI - scoped Testnet payment access intent',
    'THIS IS NOT A PAYMENT OR TRANSFER SIGNATURE',
    'Origin: ' + X402_SCOPE.origin,
    'Version: ' + intent.version,
    'Network: ' + intent.network,
    'Badge: ' + intent.badge,
    'OwnerAccount: ' + intent.account,
    'Resource: ' + intent.resource,
    'Merchant: ' + intent.payTo,
    'Asset: CCD',
    'AmountMicroCCD: ' + intent.amountMicroCcd,
    'Nonce: ' + intent.nonce,
    'IssuedAt: ' + intent.issuedAt
  ].join('\n');
}

export function assertWalletTestnet(account, chain) {
  if (account !== PROOF_CONTEXT.owner) throw Error('WRONG_AGENT_OWNER');
  if (typeof chain !== 'string' ||
      !chain.toLowerCase().startsWith(X402_SCOPE.network.slice(4))) {
    throw Error('WRONG_NETWORK');
  }
  return true;
}

export function checkX402Challenge(data, merchant) {
  if (!data || typeof data !== 'object' || data.x402Version !== 2 ||
      !Array.isArray(data.accepts) || data.accepts.length !== 1) return false;
  const r=data.accepts[0];
  return r && r.scheme === 'exact' && r.network === X402_SCOPE.network &&
    r.asset === X402_SCOPE.asset && r.amount === X402_SCOPE.amountMicroCcd &&
    r.payTo === merchant && typeof r.extra?.feePayer === 'string' &&
    r.extra.feePayer !== merchant && r.extra.feePayer !== PROOF_CONTEXT.owner &&
    Number.isSafeInteger(r.maxTimeoutSeconds) &&
    r.maxTimeoutSeconds > 0 && r.maxTimeoutSeconds <= 90;
}
