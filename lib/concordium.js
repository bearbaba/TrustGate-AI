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
  if (!Array.isArray(value.issues)) return { valid: false, reason: 'MISSING_ISSUES' };

  // The live Concordium verifier returns extension_conformant and
  // verification_present inside checks, NOT as top-level properties.
  const checks = value.checks;
  if (!checks || typeof checks !== 'object' || Array.isArray(checks))
    return { valid: false, reason: 'MISSING_VERIFICATION_CHECKS' };

  const onChain = value.on_chain;
  const inactive = onChain?.status !== 'Active' || checks.status_active !== true;
  const requiredChecks = [
    'on_chain_agent_found', 'status_active', 'has_agent_uri', 'card_fetched',
    'hash_matches_on_chain', 'badge_present', 'badge_well_formed',
    'token_address_matches', 'owner_matches', 'contracts_match',
    'verify_present', 'extension_conformant', 'verification_present',
    'verify_url_matches'
  ];
  const positiveChecks = requiredChecks.every(key => checks[key] === true);
  const hashMatches = typeof value.card_sha256 === 'string' &&
    typeof onChain?.metadata_hash_hex === 'string' &&
    value.card_sha256.toLowerCase() === onChain.metadata_hash_hex.toLowerCase();
  const uriMatches = typeof value.agent_uri === 'string' && value.agent_uri.length > 0 &&
    value.agent_uri === onChain?.agent_uri;
  const valid = value.badge_valid === true &&
    value.network === 'testnet' && value.http_status === 200 &&
    value.issues.length === 0 && !inactive && positiveChecks && hashMatches && uriMatches;
  return {
    valid,
    reason: valid ? 'BADGE_VERIFIED' : (inactive ? 'AGENT_INACTIVE' : 'BADGE_NOT_VERIFIED'),
    summary: {
      badgeValid: value.badge_valid === true,
      extensionConformant: checks.extension_conformant === true,
      verificationPresent: checks.verification_present === true,
      hashMatchesOnChain: hashMatches && checks.hash_matches_on_chain === true,
      ownerMatches: checks.owner_matches === true,
      issuesCount: value.issues.length,
      status: onChain?.status || 'Unknown',
      network: value.network || null,
      tokenId: Number.isInteger(value.token_id) ? value.token_id : null
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
