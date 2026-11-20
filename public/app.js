'use strict';
const byId = id => document.getElementById(id);
const records = [];
const messages = {
  BADGE_VERIFIED: 'Official Concordium resolver passed all required badge checks.',
  INVALID_BADGE: 'Invalid badge format. Provide a Base58Check token or a CAIP-19 badge.',
  REGISTRY_UNAVAILABLE: 'Registry could not be reached. The request is blocked.',
  NOT_FOUND: 'No matching registered agent exists.',
  REVOKED: 'Agent badge has been revoked.',
  RATE_LIMITED: 'Registry rate limit reached. No authorization granted.',
  REGISTRY_ERROR: 'Upstream registry error. No authorization granted.',
  BADGE_NOT_VERIFIED: 'Mandatory registry checks failed.',
  AGENT_INACTIVE: 'Agent is inactive.',
  BAD_RESPONSE: 'Unexpected registry response.',
  MISSING_ISSUES: 'Registry did not return mandatory verification details.'
};
const setBusy = (id, active, normal) => { const b = byId(id); b.disabled = active; b.textContent = active ? 'Checking registry…' : normal; };
function status(kind, heading, details) {
  byId('verifyStatus').className = 'status ' + kind;
  byId('verifyHeading').textContent = heading;
  byId('verifyText').textContent = details;
}
async function callApi(path, opts) {
  const response = await fetch(path, { cache: 'no-store', ...opts });
  const data = await response.json();
  if (!response.ok) throw Error(data?.error || 'SERVICE_UNAVAILABLE');
  return data;
}
byId('badge').addEventListener('input', () => status('', 'Verification required', 'Badge changed. Verify again before trusting this agent.'));
byId('verifyBtn').addEventListener('click', async () => {
  setBusy('verifyBtn', true, 'Verify identity ↗');
  status('', 'Verification in progress', 'Querying official Concordium registry…');
  try {
    const data = await callApi('/api/verify?badge=' + encodeURIComponent(byId('badge').value.trim()));
    status(data.ok ? 'good' : 'bad', data.ok ? 'Identity verified' : 'Identity not verified', (messages[data.code] || data.code) + ' · ' + (data.checkedAt ? new Date(data.checkedAt).toLocaleString() : ''));
  } catch (err) {
    status('bad', 'Unable to verify', 'Request failed: ' + err.message + '. No authorization granted.');
  } finally {
    setBusy('verifyBtn', false, 'Verify identity ↗');
  }
});
byId('evaluateForm').addEventListener('submit', async event => {
  event.preventDefault();
  setBusy('evaluateBtn', true, 'Evaluate request ↗');
  const intent = {
    badge: byId('badge').value.trim(), recipient: byId('service').value,
    amountUsd: byId('amount').value.trim(), purpose: byId('purpose').value.trim()
  };
  try {
    const result = await callApi('/api/evaluate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(intent)
    });
    renderDecision(result);
    records.unshift(result);
    if (records.length > 50) records.pop();
    renderTrail();
    status(result.identityCheck.verified ? 'good' : 'bad', result.identityCheck.verified ? 'Verified for this evaluation' : 'Verification failed', messages[result.identityCheck.code] || result.identityCheck.code);
  } catch (err) {
    byId('decisionPanel').hidden = false;
    byId('decisionBadge').className = 'verdict block';
    byId('decisionBadge').textContent = 'ERROR';
    byId('decisionHeading').textContent = 'No authorization granted';
    byId('decisionExplanation').textContent = 'Evaluation failed: ' + err.message + '. No payment was executed.';
    byId('decisionIdentity').textContent = 'Unknown';
    byId('decisionDigest').textContent = 'No digest';
  } finally {
    setBusy('evaluateBtn', false, 'Evaluate request ↗');
  }
});
function renderDecision(r) {
  byId('decisionPanel').hidden = false;
  byId('decisionBadge').className = 'verdict ' + r.decision.toLowerCase();
  byId('decisionBadge').textContent = r.decision;
  byId('decisionHeading').textContent = r.decision === 'ALLOW' ? 'Policy passed — execution disabled' : r.decision === 'REVIEW' ? 'Human approval required' : 'Request blocked by policy';
  byId('decisionExplanation').textContent = 'Reasons: ' + r.reasons.join(', ') + '. No transaction executed.';
  byId('decisionIdentity').textContent = r.identityCheck.verified ? 'Verified' : 'Not verified';
  byId('decisionDigest').textContent = r.digest;
}
function renderTrail() {
  byId('trailCount').textContent = records.length + ' record(s)';
  const list = byId('trailList'); list.replaceChildren();
  if (records.length === 0) { const empty = document.createElement('div'); empty.className = 'empty'; empty.textContent = 'No evaluations yet.'; list.append(empty); return; }
  for (const r of records) {
    const row = document.createElement('div'); row.className = 'trail-entry';
    const left = document.createElement('div');
    const state = document.createElement('strong'); state.className = r.decision; state.textContent = r.decision;
    const time = document.createElement('small'); time.textContent = new Date(r.evaluatedAt).toLocaleString(); left.append(state, time);
    const middle = document.createElement('div');
    const target = document.createElement('strong');
    target.textContent = (r.recipient || 'Unknown') + ' · $' + (r.amountCents == null ? '—' : (r.amountCents / 100).toFixed(2));
    const reason = document.createElement('small'); reason.textContent = r.reasons.join(', '); middle.append(target, reason);
    const right = document.createElement('div'); const hash = document.createElement('code');
    hash.textContent = 'SHA-256 ' + r.digest.slice(0, 24) + '…';
    const noExecution = document.createElement('small'); noExecution.textContent = 'NOT EXECUTED';
    right.append(hash, noExecution); row.append(left, middle, right); list.append(row);
  }
}
byId('exportBtn').addEventListener('click', () => {
  if (records.length === 0) { byId('exportBtn').textContent = 'No records to export'; return; }
  const json = JSON.stringify({ app: 'TrustGate AI', version: '0.1', storage: 'browser session only', records }, null, 2);
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const anchor = document.createElement('a'); anchor.href = url;
  anchor.download = 'trustgate-audit-' + new Date().toISOString().slice(0, 10) + '.json';
  anchor.click(); URL.revokeObjectURL(url);
});
for (const button of document.querySelectorAll('[data-view]')) {
  button.addEventListener('click', () => {
    const view = button.dataset.view;
    for (const nav of document.querySelectorAll('[data-view]')) nav.classList.toggle('active', nav === button);
    for (const panel of document.querySelectorAll('.view')) panel.classList.toggle('active', panel.id === 'view-' + view);
    byId('crumb').textContent = { lab: 'DECISION LAB', trail: 'AUDIT TRAIL', about: 'ARCHITECTURE' }[view];
    window.scrollTo({ top: 0, behavior: 'instant' });
  });
}
