import { CcdAmount } from '@concordium/web-sdk';
import { getAccountInfo } from './live-proof.js';

/**
 * Read-only Testnet account checks, never a transaction or signing operation.
 * A positive available CCD balance is necessary for the sponsor to pay gas,
 * but does not establish fee sufficiency or key ownership.
 */
function balancePositive(info) {
  try {
    const amount = CcdAmount.toMicroCcd(info?.accountAvailableBalance);
    return typeof amount === 'bigint' && amount > 0n;
  } catch {
    return false;
  }
}

export function assessSponsorAccounts(merchantInfo, sponsorInfo) {
  const merchantExists = !!merchantInfo && typeof merchantInfo === 'object' &&
    !!merchantInfo.accountAddress;
  const sponsorExists = !!sponsorInfo && typeof sponsorInfo === 'object' &&
    !!sponsorInfo.accountAddress;
  const sponsorHasAvailableCcd = sponsorExists && balancePositive(sponsorInfo);
  return {
    status: merchantExists && sponsorHasAvailableCcd
      ? 'ACCOUNTS_PRESENT_SPONSOR_HAS_CCD'
      : 'ACCOUNTS_NOT_READY',
    merchantExists,
    sponsorExists,
    sponsorHasAvailableCcd: !!sponsorHasAvailableCcd
  };
}

export async function inspectSponsorAccounts(config, deps = {}) {
  const lookup = deps.accountLookup || getAccountInfo;
  if (!config || !config.address || !config.merchant ||
      config.address === config.merchant) {
    return {
      status: 'PUBLIC_ACCOUNTS_NOT_CONFIGURED',
      merchantExists: false,
      sponsorExists: false,
      sponsorHasAvailableCcd: false,
      signingKeyVerified: false,
      settlementVerified: false
    };
  }
  const [merchant, sponsor] = await Promise.allSettled([
    lookup(config.merchant), lookup(config.address)
  ]);
  // An RPC failure is not proof that an account does not exist. Do not
  // represent a timeout or stale node as a definitive "account absent".
  if (merchant.status !== 'fulfilled' || sponsor.status !== 'fulfilled') {
    return {
      status: 'ONCHAIN_LOOKUP_UNAVAILABLE',
      merchantExists: null,
      sponsorExists: null,
      sponsorHasAvailableCcd: null,
      signingKeyVerified: false,
      settlementVerified: false
    };
  }
  return {
    ...assessSponsorAccounts(merchant.value, sponsor.value),
    signingKeyVerified: false,
    settlementVerified: false
  };
}

export function sponsorCanProceed(accounts) {
  return accounts?.status === 'ACCOUNTS_PRESENT_SPONSOR_HAS_CCD' &&
    accounts.merchantExists === true &&
    accounts.sponsorExists === true &&
    accounts.sponsorHasAvailableCcd === true;
}
