const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const STUB = fs.readFileSync(path.join(__dirname, 'stub.js'), 'utf8');
/* 画面の写しは SHOTS=1 を付けて実行したときだけ tests/shots に保存する */
const SHOTS = path.join(__dirname, 'shots');
if (process.env.SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

const EXPOSE = 'window.__t = { md, inline, esc, mend, splitLedger, parseActions, fitTurns, S, P, Got, Held, Store, queues, applyActions, contextTurns, rulesText, pickTier, cleanDoc, titleOf, bodyWithoutTitle, speakable, errText, greetingText, nextOrderNo, orderPrompt, reviewPrompt, speak, deviceSpeak, stopSpeaking, listBlock, findProject };\n';

/* ページ本体（リポジトリ直下の index.html）に、テストから中の関数を呼ぶための1行だけを差し込んで読み込む。 */
function variant() {
  const s = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const anchor = 'const hot = window.claude && window.claude.hot;';
  if (!s.includes(anchor)) throw new Error('expose anchor not found');
  return s.replace(anchor, () => EXPOSE + anchor);
}

async function open(browser, o = {}) {
  const { cfg = {}, viewport = { width: 390, height: 844 }, colorScheme = 'light', ls = null, hash = '', reducedMotion = 'no-preference', init = null } = o;
  const ctx = await browser.newContext({ viewport, colorScheme, locale: 'ja-JP', timezoneId: 'Asia/Tokyo', reducedMotion, deviceScaleFactor: o.dsf || 1 });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
  const body = variant();
  await ctx.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith('https://jarvis.test/')) return route.fulfill({ contentType: 'text/html; charset=utf-8', body });
    return route.abort();
  });
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type()) && !/Failed to load resource/.test(m.text())) logs.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', (e) => logs.push('pageerror: ' + e.message));
  await page.addInitScript((c) => { window.__stubCfg = c; }, cfg);
  if (init) await page.addInitScript(init.fn, init.arg);
  await page.addInitScript(STUB);
  if (ls) await page.addInitScript((d) => { for (const [k, val] of Object.entries(d)) if (localStorage.getItem(k) === null) localStorage.setItem(k, val); }, ls);
  await page.goto('https://jarvis.test/index.html' + hash);
  return { ctx, page, logs };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitLoaded(page, ms = 4000) { await page.waitForFunction(() => window.__t && window.__t.S.loaded, null, { timeout: ms }); }
async function waitIdle(page, ms = 9000) { await page.waitForFunction(() => window.__t && !window.__t.S.busy, null, { timeout: ms }); }
async function sendMsg(page, text, reply) {
  if (reply) await page.evaluate((r) => { window.__stub.replies.push(r); }, reply);
  await page.fill('#msg', text);
  await page.click('#send');
}
const shot = (page, name) => (process.env.SHOTS ? page.screenshot({ path: path.join(SHOTS, name + '.png') }) : Promise.resolve());
const toastInfo = (page) => page.evaluate(() => { const el = document.querySelector('#toast'); if (el.hidden) return { hidden: true }; const r = el.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { hidden: false, text: el.innerText, visible: top === el, hit: top && (top.id || top.tagName + '.' + top.className), top: Math.round(r.top) }; });
const overflow = (page) => page.evaluate(() => {
  const de = document.documentElement; const out = [];
  if (de.scrollWidth > window.innerWidth + 1) out.push('page scrollWidth ' + de.scrollWidth + ' > ' + window.innerWidth);
  for (const el of document.querySelectorAll('body *')) {
    if (el.closest('[hidden]') || el.closest('dialog:not([open])')) continue;
    const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
    if (r.right > window.innerWidth + 1 || r.left < -1) { if (el.closest('.tbl, pre, .md table')) continue; out.push((el.id ? '#' + el.id : el.tagName.toLowerCase() + '.' + String(el.className).split(' ')[0]) + ' ' + Math.round(r.left) + '..' + Math.round(r.right)); }
  }
  return out.slice(0, 8);
});

let pass = 0; let fail = 0; const failed = [];
function check(label, ok, detail) {
  if (ok) { pass++; console.log('  ok   ' + label + (detail !== undefined ? '  → ' + detail : '')); }
  else { fail++; failed.push(label); console.log('  FAIL ' + label + (detail !== undefined ? '  → ' + detail : '')); }
}
function note(label, detail) { console.log('  note ' + label + (detail !== undefined ? '  → ' + detail : '')); }
async function run(scenarios) {
  const only = process.argv.slice(2);
  const browser = await chromium.launch();
  for (const [name, fn] of Object.entries(scenarios)) {
    if (only.length && !only.some((o) => name.startsWith(o))) continue;
    console.log('\n## ' + name);
    try { await fn(browser); } catch (e) { fail++; failed.push(name + ' (threw)'); console.log('  FAIL (scenario threw) ' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : e)); }
  }
  await browser.close();
  console.log('\npass=' + pass + ' fail=' + fail + (failed.length ? '\nfailed: ' + failed.join(' / ') : ''));
  process.exitCode = fail ? 1 : 0;
}

const U = 'data/users/u_test1';
const SEED = (extra = {}) => Object.assign({
  [U + '/desk']: { v: 1, prefs: { userName: '井上さん', length: 'normal', review: { text: '**提案**：判断待ちを先に。', at: 1 } }, memory: [{ id: 'm1', text: '報告は結論から', at: 1 }, { id: 'm2', text: 'テストはpytestで書く', at: 2 }, { id: 'm3', text: '安全に関わる変更は必ず二重確認', at: 3 }] },
  [U + '/desk/projects/pA']: { name: '金型温度ロガー', kind: 'work', status: 'build', summary: '金型の温度を記録する', state: 'S1実装中。センサー3点の取り付けまで完了', next: 'S1の検証', note: '', asOf: '2026-11-01', order: 1, createdAt: 1, updatedAt: 1 },
  [U + '/desk/projects/pB']: { name: '湯流れ解析の比較', kind: 'work', status: 'wait', summary: '', state: '', next: '', note: '', asOf: '2026-10-02', order: 2, createdAt: 2, updatedAt: 2 },
  [U + '/desk/projects/pC']: { name: '家計簿アプリ', kind: 'personal', status: 'hold', summary: '', state: '', next: '', note: '', asOf: '2026-09-10', order: 3, createdAt: 3, updatedAt: 3 },
}, extra);
const TALK = { turns: [{ role: 'user', content: '前回の相談その1', at: 1 }, { role: 'assistant', content: '前回の返答その1', at: 2 }, { role: 'user', content: '前回の相談その2', at: 3 }, { role: 'assistant', content: '前回の返答その2', at: 4 }], updatedAt: 4 };

module.exports = { open, sleep, waitLoaded, waitIdle, sendMsg, shot, check, note, run, SHOTS, variant, toastInfo, overflow, U, SEED, TALK };
