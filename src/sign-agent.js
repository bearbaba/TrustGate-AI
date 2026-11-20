import { detectConcordiumProvider } from '@concordium/browser-wallet-api-helpers';
import {
  AccountTransactionType,
  CcdAmount,
  ContractAddress,
  ConcordiumGRPCClient,
  EntrypointName,
  Parameter,
  serializeUpdateContractParameters,
} from '@concordium/web-sdk';

const OWNER = '34C1ozW8edKtBmA8FUFoR4aBys8ofuwtRmYqqbzNVPAsATT4wk';
const BADGE = 'JyP9UhV91L3jWGjHH4aB7';
const CARD_URL = 'https://trustgate-ai.vercel.app/.well-known/agent-card.json';
const GENESIS_PREFIX = '4221332d34e1694168c2a0c0b3fd0f27';
const METADATA_SHA256 = 'ed33956577d378ef0bfd537505863d846a2c130513302a2d45d99e5bfc009c44';
const PARAMETER_HEX = '082b05000000000000013b00000068747470733a2f2f7472757374676174652d61692e76657263656c2e6170702f2e77656c6c2d6b6e6f776e2f6167656e742d636172642e6a736f6e01ed33956577d378ef0bfd537505863d846a2c130513302a2d45d99e5bfc009c44';
const PARAMETER_JSON = {
  token_id: '2b05000000000000',
  agent_uri: { Some: [CARD_URL] },
  metadata_hash: { Some: [[237,51,149,101,119,211,120,239,11,253,83,117,5,134,61,132,106,44,19,5,19,48,42,45,69,217,158,91,252,0,156,68]] },
};
let provider;
let selectedAccount;
let moduleSchema;
let verified = false;
let submitting = false;

const id = (n) => document.getElementById(n);
const status = (message, kind = '') => {
  id('status').textContent = message;
  id('status').className = 'status ' + kind;
};
const hex = (bytes) => [...new Uint8Array(bytes)].map(x => x.toString(16).padStart(2, '0')).join('');
const toBase64 = (bytes) => {
  const data = new Uint8Array(bytes);
  let str = '';
  for (let i = 0; i < data.length; i += 4096) {
    str += String.fromCharCode(...data.subarray(i, i + 4096));
  }
  return btoa(str);
};
const toPlain = (x) => {
  if (!x) return '';
  return typeof x === 'string' ? x : String(x?.value ?? x);
};
const lock = () => { verified = false; id('sign').disabled = true; };

async function verifyCard() {
  const response = await fetch(CARD_URL, { cache: 'no-store' });
  if (!response.ok) throw Error('Không thể tải Agent Card từ Vercel.');
  const bytes = await response.arrayBuffer();
  const hash = hex(await crypto.subtle.digest('SHA-256', bytes));
  if (hash !== METADATA_SHA256) throw Error('Agent Card đã thay đổi; hash không còn khớp. Không được ký.');
  const card = JSON.parse(new TextDecoder().decode(bytes));
  const hasBadge = card?.capabilities?.extensions?.some(
    x => x.uri === 'https://docs.concordium.com/a2a-extensions/concordium-badge/v1'
      && x.params?.tokenAddress?.endsWith('/cis-2:' + BADGE));
  if (!hasBadge) throw Error('Agent Card thiếu badge #1323; không thể ký.');
  return hash;
}

async function preflight() {
  lock();
  id('check').disabled = true;
  status('Đang xác minh ví, mạng Testnet, Agent Card và tham số giao dịch...');
  try {
    provider = await detectConcordiumProvider();
    const account = await provider.connect();
    if (account !== OWNER) throw Error('Sai ví chủ sở hữu. Hãy chọn ví 34C1ozW8ed…ATT4wk.');
    selectedAccount = account;
    const chain = await provider.getSelectedChain();
    if (typeof chain !== 'string' || !chain.toLowerCase().startsWith(GENESIS_PREFIX))
      throw Error('Ví không ở Concordium Testnet. Hãy đổi mạng trước khi tiếp tục.');
    id('account').textContent = account;
    await verifyCard();

    const grpc = new ConcordiumGRPCClient(provider.grpcTransport);
    const contract = ContractAddress.create(12802n, 0n);
    const info = await grpc.getInstanceInfo(contract);
    const contractName = toPlain(info?.name);
    if (contractName !== 'CIS-8004') throw Error('Tên contract on-chain không khớp: ' + contractName);
    if (!info?.sourceModule?.moduleRef) throw Error('Không lấy được module reference của contract.');
    moduleSchema = await grpc.getEmbeddedSchema(info.sourceModule.moduleRef);
    if (!moduleSchema) throw Error('Contract không trả về embedded schema; không thể ký an toàn.');
    const bytes = serializeUpdateContractParameters(
      info.name,
      EntrypointName.fromString('setAgentURI'),
      PARAMETER_JSON,
      moduleSchema
    );
    if (Parameter.toHexString(bytes).toLowerCase() !== PARAMETER_HEX)
      throw Error('Parameter bytes từ schema on-chain KHÔNG khớp builder. Giao dịch bị khóa.');
    const connected = await provider.getMostRecentlySelectedAccount();
    if (connected !== OWNER) throw Error('Ví đang kết nối không đúng chủ sở hữu Agent.');
    verified = true;
    id('sign').disabled = false;
    status('Đã xác minh xong. Có thể mở Concordium Wallet để ký setAgentURI của Agent #1323.', 'good');
  } catch (error) {
    status('Không thể mở khóa ký: ' + (error?.message || String(error)), 'bad');
  } finally {
    id('check').disabled = false;
  }
}

async function sign() {
  if (!verified || submitting || !provider || selectedAccount !== OWNER || !moduleSchema) return;
  submitting = true;
  id('sign').disabled = true;
  status('Đang mở Concordium Wallet. Chỉ xác nhận nếu mạng Testnet, contract 12802/0 và hàm setAgentURI đều đúng.');
  try {
    const chain = await provider.getSelectedChain();
    const selected = await provider.getMostRecentlySelectedAccount();
    if (typeof chain !== 'string' || !chain.toLowerCase().startsWith(GENESIS_PREFIX) || selected !== OWNER)
      throw Error('Ví hoặc mạng đã thay đổi. Kiểm tra lại từ đầu.');
    await verifyCard();
    const transactionHash = await provider.sendTransaction(
      OWNER,
      AccountTransactionType.Update,
      {
        amount: CcdAmount.fromMicroCcd(0n),
        contractAddress: { index: 12802n, subindex: 0n },
        receiveName: 'CIS-8004.setAgentURI',
        maxContractExecutionEnergy: 30000n,
      },
      PARAMETER_JSON,
      { type: 'module', value: toBase64(moduleSchema) }
    );
    if (!/^[a-fA-F0-9]{64}$/.test(transactionHash)) throw Error('Ví trả về transaction hash không hợp lệ.');
    id('tx').textContent = transactionHash;
    id('explorer').href = 'https://ccdexplorer.io/testnet/transaction/' + transactionHash;
    id('tx-panel').hidden = false;
    status('Ví đã gửi giao dịch. Đợi trạng thái FINALIZED trên CCDExplorer rồi bấm kiểm tra badge. Chưa coi là thành công trước khi xác minh.', 'good');
  } catch (error) {
    status('Giao dịch chưa được xác nhận: ' + (error?.message || String(error)), 'bad');
  } finally {
    submitting = false;
    lock();
  }
}

async function verifyBadge() {
  id('verify').disabled = true;
  status('Đang kiểm tra Agent Badge qua registry...');
  try {
    const response = await fetch('https://agent-registry-mcp.concordium.com/v1/check-badge/' + BADGE, {cache:'no-store'});
    if (!response.ok) throw Error('Không truy cập được registry từ trình duyệt. Có thể dùng lệnh curl để xác minh.');
    const data = await response.json();
    const success = data.badge_valid === true && data.extension_conformant === true &&
      data.verification_present === true && Array.isArray(data.issues) && data.issues.length === 0;
    id('result').textContent = JSON.stringify(data, null, 2);
    status(success ? 'Agent Badge đã được xác minh đầy đủ!' : 'Badge chưa đạt đủ điều kiện. Kiểm tra giao dịch và metadata trên blockchain.', success ? 'good' : 'bad');
  } catch (err) { status('Lỗi xác minh: ' + err.message, 'bad'); }
  finally { id('verify').disabled = false; }
}
id('check').addEventListener('click', preflight);
id('sign').addEventListener('click', sign);
id('verify').addEventListener('click', verifyBadge);
id('wallet-info').textContent = OWNER;
id('uri-info').textContent = CARD_URL;
id('hash-info').textContent = METADATA_SHA256;
