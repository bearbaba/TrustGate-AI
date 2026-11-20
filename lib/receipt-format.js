import { createHash } from 'node:crypto';

/** Stable, order-independent JSON SHA-256 integrity checksum.
 * This is NOT a server signature and does not independently authenticate issuance.
 */
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  }
  return value;
}
export function digestJson(value) {
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}
export function attachDigest(receiptBody) {
  return {...receiptBody, digest: digestJson(receiptBody)};
}
export function validateDigest(receipt) {
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) return false;
  if (typeof receipt.digest !== 'string' || !/^[a-f0-9]{64}$/.test(receipt.digest)) return false;
  const { digest, ...body } = receipt;
  return digestJson(body) === digest;
}
