import { runLiveProof } from '../lib/live-proof.js';
export default async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if (req.method !== 'POST') return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
  const ct = req.headers?.['content-type'] || '';
  if (ct && !ct.toLowerCase().startsWith('application/json')) return res.status(415).json({error:'JSON_REQUIRED'});
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) return res.status(400).json({error:'INVALID_JSON'});
  const result = await runLiveProof(req.body);
  return res.status(200).json(result);
}
