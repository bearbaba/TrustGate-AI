import test from 'node:test';
import assert from 'node:assert/strict';
import { PROOF_CONTEXT } from '../lib/proof-message.js';
import {
  X402_SCOPE, createUnsignedX402Intent,
  buildX402SignedMessage, assertWalletTestnet, checkX402Challenge
} from '../lib/x402-client-intent.js';
import { buildX402SignedMessage as serverMessage, X402_TESTNET, X402_RESOURCE } from '../lib/x402-config.js';

const merchant='4XYepvZZJyFkKTTgoTCmNuQYar1PBiscdZBh6cRotsG2Y7SBDf';
const sponsor='4Q9ZNet1wKBCS3HWYxBSrHjKPfyois52h3gYUUHKe8Fw4Cf3s3';
const nonce='a'.repeat(32);
const now=Date.UTC(2026,10,21,6,0);
const paymentRequirements={
  scheme:'exact',network:X402_SCOPE.network,asset:'CCD',
  amount:'100000',payTo:merchant,maxTimeoutSeconds:90,
  extra:{feePayer:sponsor}
};
const challenge={x402Version:2,accepts:[paymentRequirements]};

test('Browser and backend share exactly the same canonical signed intent',()=>{
  const intent=createUnsignedX402Intent(PROOF_CONTEXT.owner,merchant,nonce,now);
  assert.equal(intent.network,X402_TESTNET);
  assert.equal(intent.resource,X402_RESOURCE);
  assert.equal(intent.amountMicroCcd,'100000');
  assert.equal(intent.badge,PROOF_CONTEXT.badge);
  assert.equal(buildX402SignedMessage(intent),serverMessage(intent));
  assert.match(buildX402SignedMessage(intent),/THIS IS NOT A PAYMENT OR TRANSFER SIGNATURE/);
  assert.match(buildX402SignedMessage(intent),/AmountMicroCCD: 100000/);
});

test('Read-only challenge intent rejects nonowner, bad nonce, invalid merchant and time',()=>{
  assert.throws(()=>createUnsignedX402Intent(merchant,merchant,nonce,now));
  assert.throws(()=>createUnsignedX402Intent(PROOF_CONTEXT.owner,PROOF_CONTEXT.owner,nonce,now));
  assert.throws(()=>createUnsignedX402Intent(PROOF_CONTEXT.owner,merchant,'invalid',now));
  assert.throws(()=>createUnsignedX402Intent(PROOF_CONTEXT.owner,merchant,nonce,NaN));
});

test('Owner wallet must match expected account and Testnet genesis',()=>{
  assert.equal(assertWalletTestnet(PROOF_CONTEXT.owner,X402_SCOPE.network.slice(4)),true);
  assert.throws(()=>assertWalletTestnet(merchant,X402_SCOPE.network.slice(4)));
  assert.throws(()=>assertWalletTestnet(PROOF_CONTEXT.owner,'invalid-chain'));
});

test('Only one exact 0.1 CCD Testnet challenge with a distinct sponsor is accepted',()=>{
  assert.equal(checkX402Challenge(challenge,merchant),true);
  const rejects=[
    {x402Version:1,accepts:[paymentRequirements]},
    {x402Version:2,accepts:[]},
    {x402Version:2,accepts:[paymentRequirements,paymentRequirements]},
    {x402Version:2,accepts:[{...paymentRequirements,network:'ccd:9dd9ca4d19e9393877d2c44b70f89acb'}]},
    {x402Version:2,accepts:[{...paymentRequirements,amount:'100001'}]},
    {x402Version:2,accepts:[{...paymentRequirements,payTo:PROOF_CONTEXT.owner}]},
    {x402Version:2,accepts:[{...paymentRequirements,extra:{feePayer:merchant}}]},
    {x402Version:2,accepts:[{...paymentRequirements,maxTimeoutSeconds:120}]}
  ];
  for(const data of rejects)assert.equal(checkX402Challenge(data,merchant),false);
});
