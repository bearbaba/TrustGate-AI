import { verifyBadge } from '../lib/concordium.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'GET') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  const badge = Array.isArray(req.query?.badge) ? '' : req.query?.badge;
  const result = await verifyBadge(badge);
  return res.status(200).json(result);
}
