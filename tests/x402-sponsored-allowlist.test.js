import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {AccountAddress} from '@concordium/web-sdk';
import {PROOF_CONTEXT} from '../lib/proof-message.js';

const owner=PROOF_CONTEXT.owner;

test('Concordium sponsored wallet API allowlist requires raw Base58 owner string',()=>{
  // In Concordium/concordium-browser-wallet, background/index.ts
  // runIfAccountIsAllowlisted checks allowlist[origin].includes(accountAddress).
  // sendSponsoredTransaction unlike signMessage forwards accountAddress as-is.
  const storedWalletAllowlist=[owner];
  assert.equal(storedWalletAllowlist.includes(owner),true);
  const parsedAddress=AccountAddress.fromBase58(owner);
  assert.equal(AccountAddress.toBase58(parsedAddress),owner);
  assert.equal(storedWalletAllowlist.includes(parsedAddress),false);
});

test('native checkout sends exact validated owner string, not an AccountAddress object',async()=>{
  const source=await readFile(new URL('../src/x402-sponsored-wallet.js',import.meta.url),'utf8');
  assert.match(source,/const \{account\}=await connectOwnerWallet\(wallet\)/);
  assert.match(source,/assertWalletTestnet\(account,await wallet\.getSelectedChain\(\)\)/);
  assert.match(source,/requireScope\(response,account,config\.merchant,state\.sponsor\)/);
  assert.match(source,/await wallet\.sendSponsoredTransaction\(account,tx\)/);
  assert.doesNotMatch(source,/wallet\.sendSponsoredTransaction\(AccountAddress\.fromBase58\(account\),tx\)/);
  assert.match(source,/walletSubmissionAttempted=true/);
  assert.match(source,/keepPublicTransactionHash\(hash\)/);
});

test('HTTP 402 preflight uses same raw Base58 owner for wallet message signing',async()=>{
  const source=await readFile(new URL('../src/x402-preflight.js',import.meta.url),'utf8');
  assert.match(source,/const \{account\}=await connectOwnerWallet\(wallet\)/);
  assert.match(source,/await wallet\.signMessage\(account,buildX402SignedMessage\(intent\)\)/);
});
