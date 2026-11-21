import { createPrivateKey, createPublicKey, timingSafeEqual } from 'node:crypto';
import { getAccountInfo } from './live-proof.js';

/**
 * The official x402 Concordium facilitator uses buildBasicAccountSigner(seed).
 * It signs with credential index 0, key index 0. A valid 32-byte hex seed
 * must therefore map to that exact, currently-active Ed25519 public key.
 *
 * This check is read-only. It neither signs, submits, nor funds anything.
 * Never return the seed or derived key in public API responses.
 */
export function deriveSponsorPublicKey(seedHex) {
  if (typeof seedHex !== 'string' || !/^[a-f0-9]{64}$/i.test(seedHex)) {
    throw Error('INVALID_SPONSOR_SIGNER_KEY');
  }
  const seed = Buffer.from(seedHex, 'hex');
  const derPrefix = Buffer.from('302e020100300506032b657004220420','hex');
  try {
    const privateKey = createPrivateKey({
      key: Buffer.concat([derPrefix, seed]),
      format: 'der',
      type: 'pkcs8'
    });
    const spki = createPublicKey(privateKey).export({type:'spki',format:'der'});
    // Ed25519 SPKI ends in the raw 32-byte public key.
    if (spki.length !== 44 || spki.subarray(0,12).toString('hex') !==
        '302a300506032b6570032100') throw Error('UNSUPPORTED_KEY_FORMAT');
    return spki.subarray(12).toString('hex');
  } finally {
    seed.fill(0);
  }
}

export function assessSponsorSigningAuthority(accountInfo, publicKeyHex) {
  if (!accountInfo || !publicKeyHex || typeof publicKeyHex !== 'string' ||
      !/^[a-f0-9]{64}$/i.test(publicKeyHex)) {
    return {ok:false,code:'SPONSOR_KEY_NOT_VERIFIED'};
  }
  // A basic signer can only contribute one credential and one key.
  if (accountInfo.accountThreshold !== 1) {
    return {ok:false,code:'UNSUPPORTED_SPONSOR_ACCOUNT_THRESHOLD'};
  }
  const credential = accountInfo.accountCredentials?.[0] ??
    accountInfo.accountCredentials?.['0'];
  const value = credential?.value;
  if (value?.type !== 'initial' && value?.type !== 'normal') {
    return {ok:false,code:'SPONSOR_CREDENTIAL_UNAVAILABLE'};
  }
  const keys=value.contents?.credentialPublicKeys;
  if (keys?.threshold !== 1) {
    return {ok:false,code:'UNSUPPORTED_SPONSOR_CREDENTIAL_THRESHOLD'};
  }
  const record=keys.keys?.[0] ?? keys.keys?.['0'];
  if (!record || typeof record !== 'object' ||
      String(record.schemeId).toLowerCase() !== 'ed25519' ||
      typeof record.verifyKey !== 'string' ||
      !/^[a-f0-9]{64}$/i.test(record.verifyKey)) {
    return {ok:false,code:'SPONSOR_ONCHAIN_KEY_UNAVAILABLE'};
  }
  const candidate = Buffer.from(publicKeyHex,'hex');
  const expected = Buffer.from(record.verifyKey,'hex');
  if (!timingSafeEqual(candidate,expected)) {
    return {ok:false,code:'SPONSOR_ONCHAIN_SIGNING_KEY_MISMATCH'};
  }
  return {ok:true,code:'SPONSOR_ONCHAIN_SIGNING_KEY_VERIFIED'};
}

export async function inspectSponsorSigningAuthority(config, deps={}) {
  if (!config?.address) return {ok:false,code:'SPONSOR_ACCOUNT_NOT_CONFIGURED'};
  let pub;
  try { pub=deriveSponsorPublicKey(config.privateKey); }
  catch { return {ok:false,code:'SPONSOR_KEY_NOT_VERIFIED'}; }
  let accountInfo;
  try {
    accountInfo=await (deps.accountLookup||getAccountInfo)(config.address);
  } catch {
    return {ok:false,code:'SPONSOR_KEY_LOOKUP_UNAVAILABLE'};
  }
  return assessSponsorSigningAuthority(accountInfo,pub);
}
