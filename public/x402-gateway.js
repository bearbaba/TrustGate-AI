'use strict';
const $ = id => document.getElementById(id);
let enabled=false;
function row(message,checked) {
  const item=document.createElement('div');item.className='x402-check '+(checked?'ok':'missing');
  const mark=document.createElement('span');mark.textContent=checked?'✓':'○';
  const label=document.createElement('strong');label.textContent=message;
  item.append(mark,label);return item;
}
async function getStatus() {
  enabled=false;$('testQuote').disabled=true;
  $('gatewayStatus').textContent='Reading backend configuration…';
  try {
    const r=await fetch('/api/x402/status',{cache:'no-store'});
    if(!r.ok)throw Error('HTTP '+r.status);
    const data=await r.json();
    enabled=data.status==='CONFIGURED_NOT_PAYMENT_TESTED';
    $('gatewayStatus').className='status '+(enabled?'good':'');
    $('gatewayStatus').textContent=enabled?
      'Configured, but no real payment has been confirmed. Quote requires a live facilitator handshake.':
      'LOCKED — payment settlement is disabled until all prerequisites are configured.';
    $('merchantState').textContent=data.merchant||'Not configured';
    $('gatewayPrice').textContent=data.displayPrice||'0.1 Testnet CCD';
    const keys=[
      ['Enable Testnet payment gateway','ENABLE_TESTNET_GATEWAY'],
      ['Separate merchant Testnet wallet','SEPARATE_MERCHANT_ACCOUNT'],
      ['Supported HTTPS sponsor/facilitator','HTTPS_CONCORDIUM_FACILITATOR'],
      ['Durable atomic replay store','DURABLE_ATOMIC_REPLAY_STORE']
    ];
    $('readinessChecks').replaceChildren(...keys.map(([label,code])=>row(label,!data.prerequisites?.includes(code))));
    $('testQuote').disabled=!enabled;
    $('quoteResult').textContent=enabled?'Ready to request a protocol quote. No payment will be made.':'Gateway is locked until configured.';
  }catch(err){
    $('gatewayStatus').className='status bad';
    $('gatewayStatus').textContent='Could not verify server readiness: '+err.message;
    $('readinessChecks').replaceChildren();
  }
}
$('refreshStatus').addEventListener('click',getStatus);
$('testQuote').addEventListener('click',async()=>{
  $('testQuote').disabled=true;
  $('quoteResult').textContent='Checking official facilitator support…';
  try{
    const r=await fetch('/api/x402/quote',{cache:'no-store'});
    const d=await r.json();
    $('quoteResult').textContent=JSON.stringify(d,null,2);
  }catch(err){$('quoteResult').textContent='Quote failed: '+err.message;}
  finally{$('testQuote').disabled=!enabled;}
});
getStatus();
