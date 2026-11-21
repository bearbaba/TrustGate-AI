import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root=new URL('../public/',import.meta.url);
const html=await readFile(new URL('index.html',root),'utf8');
const client=await readFile(new URL('app.js',root),'utf8');

test('homepage accurately describes live wallet signatures while avoiding claims of paid settlement',()=>{
  assert.match(html,/Wallet-signed/);
  assert.match(html,/Read-only owner proof/);
  assert.match(html,/Concordium CIS-8004/);
  assert.match(html,/SETTLEMENT NOT VERIFIED/);
  assert.match(html,/ALLOW means policy approval only/);
  assert.doesNotMatch(html,/No wallets or payments/);
  assert.doesNotMatch(html,/TrustGate AI v0\.7/);
  assert.doesNotMatch(html,/TRUST ARCHITECTURE \/ v0\.7/);
});

test('Decision Lab session audit is not misrepresented as the x402 durable replay store',()=>{
  assert.match(html,/Session audit records are browser-only/);
  assert.match(html,/Redis protects x402 replays, not a permanent audit ledger/);
  assert.match(html,/This Decision Lab keeps only browser-tab history/);
});

test('working routes to live evidence, tamper testing and guarded Testnet gateway remain accessible',()=>{
  for(const route of ['/live-proof','/security-lab','/x402-gateway']) {
    assert.match(html,new RegExp('href="'+route+'"'));
  }
});

test('main page derives the safety status from the real read-only gateway endpoint',()=>{
  assert.match(html,/id="homePaymentStatus"/);
  assert.match(html,/id="homeGatewayLabel"/);
  assert.match(client,/fetch\('\/api\/x402\/status',\{cache:'no-store'\}\)/);
  assert.match(client,/LOCKED_UNTIL_CONFIGURED/);
  assert.match(client,/CONFIGURED_NOT_PAYMENT_TESTED/);
  assert.match(client,/STATUS UNKNOWN/);
  assert.doesNotMatch(client,/PAYMENT-SIGNATURE/);
});
