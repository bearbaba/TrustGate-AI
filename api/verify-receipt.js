import { verifyEvidenceReceipt } from '../lib/verify-receipt.js';
export default async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if (req.method !== 'POST') return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) return res.status(400).json({error:'INVALID_JSON'});
  if (JSON.stringify(req.body).length > 25000) return res.status(413).json({error:'RECEIPT_TOO_LARGE'});
  return res.status(200).json(await verifyEvidenceReceipt(req.body.receipt));
}
