'use strict';
const $ = id => document.getElementById(id);
let receipt = null;
const scenarios = {
  original: {label:'Authentic receipt', expected:'SIGNED_REQUEST_POLICY_AND_BADGE_VERIFIED'},
  policy: {label:'Forge policy decision + recompute SHA-256', expected:'POLICY_WITNESS_MISMATCH'},
  signature: {label:'Swap wallet signature + recompute SHA-256', expected:'INVALID_OWNER_SIGNATURE'},
  metadata: {label:'Replace on-chain card hash + recompute SHA-256', expected:'CURRENT_CARD_MISMATCH'}
};
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key,canonical(value[key])]));
  }
  return value;
}
async function rehash(r) {
  const {digest,...body} = r;
  const bytes = new TextEncoder().encode(JSON.stringify(canonical(body)));
  const hashed = await crypto.subtle.digest('SHA-256',bytes);
  return {...body,digest:[...new Uint8Array(hashed)].map(x=>x.toString(16).padStart(2,'0')).join('')};
}
const setStatus=(message,type='')=>{
  $('lab-status').textContent=message;
  $('lab-status').className='status '+type;
};
const setLoaded=loaded=>{
  for(const b of document.querySelectorAll('[data-scenario]'))b.disabled=!loaded;
};
const line=(title,content,kind)=>{
  const row=document.createElement('div');row.className='attack-row '+(kind||'');
  const name=document.createElement('strong');name.textContent=title;
  const detail=document.createElement('span');detail.textContent=content;
  row.append(name,detail);$('results').prepend(row);
};
$('receipt-input').addEventListener('change',async()=>{
  receipt=null;setLoaded(false);$('results').replaceChildren();
  const file=$('receipt-input').files?.[0];
  if(!file)return;
  try{
    if(file.size>25000)throw Error('The receipt is too large (25 KB maximum).');
    const body=JSON.parse(await file.text());
    if(!body?.receipt || typeof body.receipt!=='object')throw Error('Please select the exported TrustGate Live Proof JSON.');
    if(body.receipt.version!=='trustgate-public-receipt/v2')throw Error('Attack Lab requires a v0.5 Policy Witness receipt (v2 format). Generate a new Live Proof receipt.');
    receipt=body.receipt;
    $('receipt-name').textContent=file.name;
    $('receipt-hash').textContent=receipt.digest||'No digest';
    setLoaded(true);
    setStatus('Receipt loaded locally. Choose a scenario to submit it to the same-origin verifier.','good');
  }catch(error){
    setStatus('Unable to load receipt: '+(error.message||'Invalid file'),'bad');
  }
});
async function tampered(mode){
  const changed=structuredClone(receipt);
  if(mode==='policy'){
    if(!changed.policyWitness)throw Error('Policy Witness missing in this receipt.');
    changed.policyWitness.decision='BLOCK';
    changed.policyWitness.reasons=['PER_REQUEST_CAP_EXCEEDED'];
    changed.policyWitness.action='NO_EVIDENCE';
  }
  if(mode==='signature'){
    const group=Object.keys(changed.proof?.ownerSignature||{})[0];
    const key=Object.keys(changed.proof?.ownerSignature?.[group]||{})[0];
    if(group===undefined||key===undefined)throw Error('No wallet signature found.');
    const original=changed.proof.ownerSignature[group][key];
    if(typeof original!=='string'||original.length<2)throw Error('Unexpected wallet signature format.');
    changed.proof.ownerSignature[group][key]=(original[0]==='a'?'b':'a')+original.slice(1);
  }
  if(mode==='metadata') changed.cardSha256='0'.repeat(64);
  return mode==='original'?changed:await rehash(changed);
}
async function runScenario(mode){
  if(!receipt)return;
  const button=document.querySelector('[data-scenario="'+mode+'"]');
  button.disabled=true;setStatus('Checking '+scenarios[mode].label+' against the real TrustGate verifier…');
  try{
    const candidate=await tampered(mode);
    const res=await fetch('/api/verify-receipt',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({receipt:candidate}),cache:'no-store'
    });
    if(!res.ok)throw Error('Verifier returned HTTP '+res.status);
    const verdict=await res.json();
    const expected = scenarios[mode].expected;
    const success = mode==='original' ? verdict.ok===true && verdict.code===expected :
      verdict.ok===false && verdict.code===expected;
    const text = 'Expected '+expected+' · Actual '+String(verdict.code)+
      ' · '+(verdict.ok?'ACCEPTED':'REJECTED');
    line(scenarios[mode].label,text,success?'pass':'warning');
    setStatus(success?
      (mode==='original'?'Original receipt validated against current Concordium state.':'Modified receipt was rejected at the expected layer.'):
      'Unexpected result: inspect the actual code and current network conditions.',success?'good':'bad');
  }catch(error){
    line(scenarios[mode].label,'Verification unavailable: '+(error.message||'Network error'),'warning');
    setStatus('Verification could not complete. No security result can be claimed.','bad');
  }finally{button.disabled=!receipt;}
}
for(const btn of document.querySelectorAll('[data-scenario]')){
  btn.addEventListener('click',()=>runScenario(btn.dataset.scenario));
}
setLoaded(false);
