import { detectConcordiumProvider } from '@concordium/browser-wallet-api-helpers';
import { AccountTransactionType, CcdAmount } from '@concordium/web-sdk';
import { AGENT, PARAMETER_JSON, getSigningParameter } from './agent-signer-params.js';

const $ = id => document.getElementById(id);
let provider = null;
let approvedAccount = null;
let ready = false;
let busy = false;
let preflightStage = 'wallet';

const stageNames = {
  wallet: 'Wallet connection',
  network: 'Account and network',
  card: 'Agent Card integrity',
  parameters: 'Transaction encoding',
  final: 'Final wallet confirmation'
};
const stages = ['wallet', 'network', 'card', 'parameters'];
const copyableError = err => {
  const value = err?.message && String(err.message).trim() !== 'Error' ? String(err.message) :
    (typeof err === 'string' && err.trim() !== 'Error' ? err : '');
  return value || 'The wallet or RPC service returned an unspecified error. Check the wallet popup and browser console.';
};
function setStatus(message, type = '') {
  $('status').textContent = message;
  $('status').className = 'status ' + type;
}
function updateStage(step, state, detail = '') {
  const item = $('stage-' + step);
  if (!item) return;
  item.dataset.state = state;
  const label = item.querySelector('small');
  if (label) label.textContent = detail || ({idle:'Not started',active:'Checking…',pass:'Passed',fail:'Failed'})[state];
}
function setStage(step, message) {
  preflightStage = step;
  updateStage(step, 'active');
  setStatus(message);
}
function disableSigning() {
  ready = false;
  $('sign').disabled = true;
}
function renderError(prefix, err) {
  const cause = copyableError(err);
  const where = stageNames[preflightStage] || preflightStage;
  setStatus(prefix + ' — ' + where + ': ' + cause, 'bad');
  updateStage(preflightStage, 'fail', 'Failed — see message below');
  console.error('[TrustGate preflight] ' + preflightStage, err);
}
function hex(buffer) {
  return Array.from(new Uint8Array(buffer), b => b.toString(16).padStart(2, '0')).join('');
}
function base64(bytes) {
  const value = new Uint8Array(bytes);
  let result = '';
  for (let offset = 0; offset < value.length; offset += 4096) {
    result += String.fromCharCode(...value.slice(offset, offset + 4096));
  }
  return btoa(result);
}
function assertAccount(account) {
  if (account !== AGENT.owner) throw new Error('Wrong wallet account. Switch to the owner ending in ATT4wk.');
}
async function assertChain(wallet) {
  const chain = await wallet.getSelectedChain();
  if (typeof chain !== 'string' || !chain.toLowerCase().startsWith(AGENT.genesisPrefix)) {
    throw new Error('Concordium Testnet is required. Change your network in Wallet Settings.');
  }
}
async function verifyCard() {
  const response = await fetch(AGENT.cardUrl, { cache: 'no-store' });
  if (!response.ok) throw new Error('Agent Card is unavailable (HTTP ' + response.status + ').');
  const raw = await response.arrayBuffer();
  const digest = hex(await crypto.subtle.digest('SHA-256', raw));
  if (digest !== AGENT.cardHash) {
    throw new Error('Hosted Agent Card SHA-256 no longer matches the approved hash. Signing is disabled.');
  }
  const document = JSON.parse(new TextDecoder().decode(raw));
  const badgeOkay = document?.capabilities?.extensions?.some(
    entry => entry.uri === 'https://docs.concordium.com/a2a-extensions/concordium-badge/v1' &&
      entry.params?.tokenAddress?.endsWith('/cis-2:' + AGENT.badge)
  );
  const registrationOkay = document?.registrations?.some(
    entry => entry.agentId === AGENT.tokenId &&
      entry.agentRegistry === 'ccd:' + AGENT.genesisPrefix + ':' + AGENT.contractIndex + '.0'
  );
  if (!badgeOkay || !registrationOkay) throw new Error('Agent Card is missing the approved Concordium badge or registration.');
  return digest;
}
function watchWallet(wallet) {
  if (wallet.__trustgateWatched) return;
  wallet.__trustgateWatched = true;
  const disconnected = () => { disableSigning(); setStatus('Wallet disconnected. Run the preflight checks again.', 'bad'); };
  const changed = () => { disableSigning(); setStatus('Wallet account or network changed. Run the preflight checks again.', 'bad'); };
  wallet.on?.('accountDisconnected', disconnected);
  wallet.on?.('accountChanged', changed);
  wallet.on?.('chainChanged', changed);
}
async function preflight() {
  if (busy) return;
  busy = true; disableSigning(); $('check').disabled = true;
  for (const step of stages) updateStage(step, 'idle');
  try {
    setStage('wallet', 'Connecting to Concordium Wallet…');
    provider = await detectConcordiumProvider(3000);
    if (!provider?.connect) throw new Error('Concordium Wallet for Web is not installed or available in this tab.');
    const account = await provider.connect();
    assertAccount(account);
    approvedAccount = account;
    $('account').textContent = account;
    watchWallet(provider);
    updateStage('wallet', 'pass');

    setStage('network', 'Checking that the wallet uses Concordium Testnet…');
    await assertChain(provider);
    updateStage('network', 'pass');

    setStage('card', 'Verifying the current hosted Agent Card bytes…');
    await verifyCard();
    updateStage('card', 'pass', 'SHA-256 and Agent #1323 matched');

    setStage('parameters', 'Re-encoding the contract call and comparing it with the official builder…');
    getSigningParameter();
    updateStage('parameters', 'pass', 'Matches official setAgentURI payload');

    // An already verified Agent Card must not trigger a redundant on-chain update.
    const verificationResponse = await fetch('/api/verify?badge=' + encodeURIComponent(AGENT.badge), {cache:'no-store'});
    if (!verificationResponse.ok) throw new Error('Cannot confirm current registry state (HTTP ' + verificationResponse.status + ').');
    const verification = await verificationResponse.json();
    if (verification.ok === true) {
      disableSigning();
      $('result').textContent = JSON.stringify(verification, null, 2);
      setStatus('Agent #1323 is already fully verified on-chain. No further signature or network fee is needed.', 'good');
      return;
    }
    ready = true;
    $('sign').disabled = false;
    setStatus('Checks passed. On-chain badge is not fully verified yet; review the transaction before signing.', 'good');
  } catch (error) {
    disableSigning();
    renderError('Preflight blocked', error);
  } finally {
    busy = false; $('check').disabled = false;
  }
}
async function sign() {
  if (!ready || busy || !provider || approvedAccount !== AGENT.owner) return;
  busy = true; disableSigning(); $('check').disabled = true;
  preflightStage = 'final';
  setStatus('Rechecking Testnet, Agent Card and contract parameter before opening your wallet…');
  try {
    const current = await provider.getMostRecentlySelectedAccount();
    assertAccount(current);
    await assertChain(provider);
    await verifyCard();
    // Check again immediately before a wallet prompt, so refreshes cannot
    // accidentally sign the same finalized update twice.
    const verificationResponse = await fetch('/api/verify?badge=' + encodeURIComponent(AGENT.badge), {cache:'no-store'});
    if (!verificationResponse.ok) throw new Error('Registry state cannot be checked; signing is blocked.');
    const verification = await verificationResponse.json();
    if (verification.ok === true) {
      setStatus('Agent #1323 is already verified. Duplicate signing is disabled.', 'good');
      return;
    }
    const { schema } = getSigningParameter();
    const hash = await provider.sendTransaction(
      AGENT.owner,
      AccountTransactionType.Update,
      {
        amount: CcdAmount.fromMicroCcd(0n),
        contractAddress: { index: AGENT.contractIndex, subindex: AGENT.contractSubindex },
        receiveName: AGENT.entrypoint,
        maxContractExecutionEnergy: 30000n,
      },
      PARAMETER_JSON,
      { type: 'Parameter', value: base64(schema) },
    );
    const tx = typeof hash === 'string' ? hash.replace(/^0x/, '') : '';
    if (!/^[a-f\d]{64}$/i.test(tx)) throw new Error('Wallet returned an unexpected transaction hash.');
    $('tx').textContent = tx;
    $('explorer').href = 'https://ccdexplorer.io/testnet/transaction/' + tx;
    $('tx-panel').hidden = false;
    setStatus('Transaction submitted. Confirm FINALIZED on CCDExplorer, then verify the badge. Submission alone is not finality.', 'good');
  } catch (error) {
    renderError('Transaction not confirmed', error);
  } finally {
    busy = false;
    $('check').disabled = false;
    disableSigning();
  }
}
async function verifyBadge() {
  $('verify').disabled = true;
  setStatus('Checking the on-chain badge verification result…');
  try {
    // Same-origin server-side resolver avoids browser cross-origin API restrictions.
    const res = await fetch('/api/verify?badge=' + encodeURIComponent(AGENT.badge), {cache:'no-store'});
    if (!res.ok) throw new Error('Verification endpoint returned HTTP ' + res.status);
    const data = await res.json();
    $('result').textContent = JSON.stringify(data, null, 2);
    setStatus(
      data.ok === true ? 'Agent #1323 verification passed.' :
        'Agent #1323 is not fully verified yet (' + (data.code || 'UNKNOWN') + '). Confirm FINALIZED and check metadata hash.',
      data.ok === true ? 'good' : 'bad'
    );
  } catch (error) {
    setStatus('Badge verification failed: ' + copyableError(error), 'bad');
  } finally { $('verify').disabled = false; }
}
$('check').addEventListener('click', preflight);
$('sign').addEventListener('click', sign);
$('verify').addEventListener('click', verifyBadge);
$('wallet-info').textContent = AGENT.owner;
$('uri-info').textContent = AGENT.cardUrl;
$('hash-info').textContent = AGENT.cardHash;
