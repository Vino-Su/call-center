// 临时验证脚本：队列轻量搜索 + 时间窗口筛选
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const PAGE_DIR = 'D:/claude_code_coding/话务中心/03-高保真页面/话务中心';
const HTML_FILE = '话务中心工作台.html';
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.png':'image/png', '.svg':'image/svg+xml', '.ico':'image/x-icon', '.woff':'font/woff', '.woff2':'font/woff2', '.json':'application/json; charset=utf-8' };

const server = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  const fp = path.join(PAGE_DIR, p);
  if (fs.existsSync(fp) && fs.statSync(fp).isFile()) { res.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream' }); res.end(fs.readFileSync(fp)); }
  else { res.writeHead(404); res.end('404'); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const serverPort = server.address().port;

const chromePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-verify-'));
const chrome = spawn(chromePath, ['--headless=new','--disable-gpu','--no-sandbox',`--user-data-dir=${profileDir}`,'--remote-debugging-port=0','--window-size=1366,900','about:blank'], { stdio: 'ignore' });

const portFile = path.join(profileDir, 'DevToolsActivePort');
let cdpPort = null;
for (let i = 0; i < 50 && !cdpPort; i++) { await new Promise(r => setTimeout(r, 200)); try { cdpPort = parseInt(fs.readFileSync(portFile, 'utf8').split('\n')[0], 10); } catch {} }
if (!cdpPort) { console.error('FAIL: CDP 端口未就绪'); process.exit(1); }
let page = null;
for (let i = 0; i < 30 && !page; i++) { try { page = (await fetch(`http://127.0.0.1:${cdpPort}/json`).then(r => r.json())).find(t => t.type === 'page'); } catch {} if (!page) await new Promise(r => setTimeout(r, 200)); }
if (!page) { console.error('FAIL: 无页面 target'); process.exit(1); }

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let msgId = 0; const pending = new Map();
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
function cdp(method, params) { return new Promise(res => { const id = ++msgId; pending.set(id, res); ws.send(JSON.stringify({ id, method, params })); }); }
await cdp('Page.enable'); await cdp('Runtime.enable');
await cdp('Page.navigate', { url: `http://127.0.0.1:${serverPort}/${HTML_FILE}` });
await new Promise(r => setTimeout(r, 3200));
async function ev(expr) { const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true }); if (r.result.exceptionDetails) return 'EXC: ' + (r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text); return r.result.result.value; }
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const setSearch = (v) => `(function(){ var i=document.getElementById('queueSearchInput'); i.value=${JSON.stringify(v)}; i.dispatchEvent(new Event('input',{bubbles:true})); return 'ok'; })()`;
const listInfo = () => `JSON.stringify({cards: document.querySelectorAll('#queueList .event-card').length, first: document.querySelector('#queueList .event-card .event-card-top')?.textContent.replace(/\\s+/g,' ').trim().slice(0,40) || '', empty: document.querySelector('.queue-empty')?.textContent || ''})`;
const counts = () => `JSON.stringify({p: document.querySelector('[data-count="待处理"]').textContent, g: document.querySelector('[data-count="挂起中"]').textContent, w: document.querySelector('[data-count="已完成"]').textContent})`;

results.push(['A1 初始渲染', await ev(`JSON.stringify({searchBox: !!document.getElementById('queueSearchInput'), chips: document.querySelectorAll('.queue-filter-chip').length, activeChip: document.querySelector('.queue-filter-chip.is-active')?.dataset.timeRange, ${counts()}, pins: document.querySelectorAll('.leaflet-event-pin').length})`)]);
results.push(['A2 搜索巡查员"张三"', await ev(setSearch('张三'))]);
await sleep(200);
results.push(['A3 张三结果', await ev(`JSON.stringify({cards: document.querySelectorAll('#queueList .event-card').length, tags: [...document.querySelectorAll('#queueList .status-tag')].map(t=>t.textContent)})`)]);
results.push(['A4 搜索车牌"沪A·D1205"', await ev(setSearch('沪A·D1205'))]);
await sleep(200);
results.push(['A5 车牌结果', await ev(listInfo())]);
results.push(['A6 搜索项目"嘉定新城"', await ev(setSearch('嘉定新城'))]);
await sleep(200);
results.push(['A7 项目结果', await ev(listInfo())]);
results.push(['A8 无结果搜索', await ev(setSearch('不存在的事件xyz'))]);
await sleep(200);
results.push(['A9 空结果提示', await ev(`document.querySelector('.queue-empty')?.textContent || '(无空提示)'`)]);
results.push(['A10 清空搜索恢复', await ev(`document.getElementById('queueSearchClear').click(); 'ok'`)]);
await sleep(200);
results.push(['A11 清空后待处理列表', await ev(listInfo())]);
results.push(['A12 切全部时间', await ev(`document.querySelector('[data-time-range="all"]').click(); 'ok'`)]);
await sleep(200);
results.push(['A13 全部激活与计数', await ev(`JSON.stringify({active: document.querySelector('.queue-filter-chip.is-active')?.dataset.timeRange, ${counts()}})`)]);
results.push(['A14 点处理中tab(清空搜索)', await ev(`(function(){ document.querySelector('[data-tab="处理中"]').click(); return JSON.stringify({searchVal: document.getElementById('queueSearchInput').value, cards: document.querySelectorAll('#queueList .event-card').length}); })()`)]);
results.push(['A15 收起队列filter隐藏', await ev(`(function(){ document.getElementById('queueCollapse').click(); return JSON.stringify({collapsed: document.querySelector('.workbench').classList.contains('queue-collapsed'), filterHidden: getComputedStyle(document.querySelector('.queue-filter')).display==='none'}); })()`)]);
results.push(['A16 展开恢复', await ev(`(function(){ document.getElementById('queueCollapse').click(); return JSON.stringify({collapsed: document.querySelector('.workbench').classList.contains('queue-collapsed'), filterHidden: getComputedStyle(document.querySelector('.queue-filter')).display==='none'}); })()`)]);
results.push(['A17 切回待处理tab', await ev(`document.querySelector('[data-tab="待处理"]').click(); 'ok'`)]);

console.log('\n===== 验证结果 =====');
let fail = 0;
for (const [name, val] of results) { const isErr = String(val).startsWith('EXC') || String(val) === 'undefined'; if (isErr) fail++; console.log(`${isErr ? '❌' : '✅'} ${name}: ${val}`); }
console.log(fail ? `\n共 ${fail} 项异常` : '\n全部通过');
chrome.kill(); server.close();
try { fs.rmSync(profileDir, { recursive: true, force: true }); } catch {}
process.exit(fail ? 1 : 0);
