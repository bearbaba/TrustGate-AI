/** Concordium official hosted registry resolver. Never fetch user-provided URLs. */
const ORIGIN = 'https://agent-registry-mcp.concordium.com';
const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{10,96}$/;

export function normalizeBadge(raw) {
  if (typeof raw !== 'string') return null;
  let s = raw.trim();
  if (s.length > 180) return null;
  if (s.includes('/cis-2:')) s = s.split('/cis-2:').at(-1);
  return BASE58.test(s) ? s : null;
}

export function interpretBadge(raw) {
  const value = raw && typeof raw === 'object' && raw.result && typeof raw.result === 'object' ? raw.result : raw;
  if (!value || typeof value !== 'object') return { valid: false, reason: 'BAD_RESPONSE' };
  const issues = value.issues;
  if (!Array.isArray(issues)) return { valid: false, reason: 'MISSING_ISSUES' };
  const statuses = [value.status, value.agent_status, value.agent?.status, value.on_chain?.status].filter(v => typeof v === 'string');
  const inactive = statuses.some(s => s.toLowerCase() !== 'active');
  const valid = value.badge_valid === true && value.extension_conformant === true &&
    value.verification_present === true && issues.length === 0 && !inactive;
  return {
    valid,
    reason: valid ? 'BADGE_VERIFIED' : (inactive ? 'AGENT_INACTIVE' : 'BADGE_NOT_VERIFIED'),
    summary: {
      badgeValid: value.badge_valid === true,
      extensionConformant: value.extension_conformant === true,
      verificationPresent: value.verification_present === true,
      issuesCount: issues.length,
      status: statuses.at(0) || 'Resolver flags passed; status not returned separately'
    }
  };
}

export async function verifyBadge(input, options = {}) {
  const badge = normalizeBadge(input);
  const checkedAt = new Date().toISOString();
  if (!badge) return { ok: false, badge: null, code: 'INVALID_BADGE', checkedAt };
  const url = ORIGIN + '/v1/check-badge/' + encodeURIComponent(badge);
  try {
    const res = await (options.fetchImpl || fetch)(url, {
      method: 'GET', headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(6500), cache: 'no-store'
    });
    if (!res.ok) return { ok: false, badge, code: res.status === 409 ? 'REVOKED' : res.status === 404 ? 'NOT_FOUND' : res.status === 429 ? 'RATE_LIMITED' : 'REGISTRY_ERROR', checkedAt };
    const json = await res.json();
    const verdict = interpretBadge(json);
    return { ok: verdict.valid, badge, code: verdict.reason, checkedAt, source: url, checks: verdict.summary };
  } catch {
    return { ok: false, badge, code: 'REGISTRY_UNAVAILABLE', checkedAt, source: url };
  }
}
