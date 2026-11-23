const { open, sleep, waitLoaded, waitIdle, sendMsg, shot, check, note, run, toastInfo, U, SEED, TALK } = require('./lib.cjs');

const state = (page) => page.evaluate(() => ({ loaded: window.__t.S.loaded, stale: window.__t.S.stale, dbError: window.__t.S.dbError, store: window.__t.S.store, banner: document.querySelector('#banner').hidden ? '' : document.querySelector('#banner').innerText, send: document.querySelector('#send').disabled, projects: window.__t.S.projects.length, turns: window.__t.S.turns.length, mem: window.__t.S.memory.length, gotDesk: window.__t.Got.desk, gotTalk: window.__t.Got.talk }));
const desk = (page) => page.evaluate((p) => window.__stub.dbDump()[p], U + '/desk');
const talk = (page) => page.evaluate((p) => { const t = window.__stub.dbDump()[p]; return t ? t.turns.map((x) => x.content) : null; }, U + '/talk');

run({
  /* ---------- 2-1. store answers late ---------- */
  async 'S1 late store (12 s): setting changed + chat during the wait'(browser) {
    const { page, logs } = await open(browser, { cfg: { seed: SEED({ [U + '/talk']: TALK }), dbFirstDelay: 12000, dbGetDelay: { [U + '/talk']: 12500 } } });
    await sleep(10400);
    let st = await state(page);
    check('usable at ~10 s, says so', st.loaded && st.stale && /読み込めたあとに保存します/.test(st.banner), st.banner);
    await page.click('#open-settings'); await page.selectOption('#set-tier', 'complex');
    await page.fill('#mem-new', '待っている間に足した記憶'); await page.press('#mem-new', 'Enter');
    await page.click('#dlg-settings [data-close]');
    await sendMsg(page, '急ぎの相談', { text: '急ぎの返答です。\n<<<LEDGER\n[{"op":"remember","text":"返答が足した記憶"}]\n>>>' }); await waitIdle(page);
    const before = { d: await desk(page), t: await talk(page), w: await page.evaluate((u) => window.__stub.dbWrites.filter((w) => w.path === u + '/desk' || w.path === u + '/talk').length, U) };
    check('nothing written to desk/talk before the stored copy arrived', before.w === 0 && before.d.memory.length === 3 && before.t.length === 4, JSON.stringify({ w: before.w }));
    await sleep(3200);
    st = await state(page);
    const d = await desk(page); const t = await talk(page);
    note('desk after arrival', JSON.stringify({ memory: d.memory.map((m) => m.text), tier: d.prefs.tier, length: d.prefs.length, review: !!d.prefs.review }));
    note('talk after arrival', JSON.stringify(t));
    check('stored memories kept + both new ones added', d.memory.length === 5 && d.memory.some((m) => m.text === '報告は結論から') && d.memory.some((m) => m.text === '待っている間に足した記憶') && d.memory.some((m) => m.text === '返答が足した記憶'));
    check('other settings and the review kept; the change applied', d.prefs.tier === 'complex' && d.prefs.length === 'normal' && !!d.prefs.review);
    check('stored talk kept and the new exchange appended after it', t.length === 6 && t[0] === '前回の相談その1' && t[4] === '急ぎの相談' && t[5] === '急ぎの返答です。', JSON.stringify(t));
    const dom = await page.evaluate(() => [...document.querySelectorAll('#log .turn')].map((n) => n.innerText.slice(0, 9)));
    check('log shows old turns above the new ones', dom.length === 7 && /前回の相談その1/.test(dom[1]) && /急ぎの相談/.test(dom[5]), JSON.stringify(dom));
    check('banner cleared, state ready', !st.stale && st.banner === '' && st.gotDesk && st.gotTalk && st.mem === 5, JSON.stringify(st));
    const undo = await page.evaluate(() => document.querySelectorAll('.applied button').length);
    check('undo for the reply still offered after the merge', undo === 1, String(undo));
    check('no console errors', logs.length === 0, logs.join(' / '));
  },

  async 'S2 late store: memory removed / talk cleared during the wait'(browser) {
    const { page } = await open(browser, { cfg: { seed: SEED({ [U + '/talk']: TALK }), dbFirstDelay: 12000, dbGetDelay: { [U + '/talk']: 12500 }, dbCache: { [U + '/desk']: SEED()[U + '/desk'] } } });
    await sleep(10400);
    let st = await state(page);
    check('cached copy shown at once, not yet treated as loaded-for-saving', st.mem === 3 && !st.gotDesk, JSON.stringify(st));
    await page.click('#open-settings');
    await page.click('#mem-list li:nth-child(2) button');                  /* drop m2 (from the cached copy) */
    await page.fill('#mem-new', 'キャッシュ表示中に足した'); await page.press('#mem-new', 'Enter');
    await page.click('#clear-talk'); await page.click('#cf-yes');
    await page.click('#dlg-settings [data-close]');
    const w = await page.evaluate((u) => window.__stub.dbWrites.filter((x) => x.path === u + '/desk' || x.path === u + '/talk').length, U);
    check('no desk/talk write while only the cached copy is here', w === 0, String(w));
    await sleep(3400);
    const d = await desk(page); const t = await talk(page);
    check('drop + add rebased onto the real copy', d.memory.map((m) => m.id).join(',').startsWith('m1,m3') && d.memory.length === 3 && d.memory[2].text === 'キャッシュ表示中に足した', JSON.stringify(d.memory.map((m) => m.text)));
    check('"会話を消す" before arrival really clears the stored talk', Array.isArray(t) && t.length === 0, JSON.stringify(t));
  },

  /* ---------- 2-2. talk read fails ---------- */
  async 'S3 talk read fails twice, later succeeds'(browser) {
    const { page } = await open(browser, { cfg: { seed: SEED({ [U + '/talk']: TALK }), dbGetFailTimes: { [U + '/talk']: 2 } } });
    await waitLoaded(page, 6000);
    let r = await page.evaluate(() => ({ gets: window.__stub.gets.length, miss: !!document.querySelector('#talk-miss'), text: (document.querySelector('#talk-miss') || {}).innerText, turns: window.__t.S.turns.length }));
    check('one retry, then a visible notice', r.gets === 2 && r.miss && /読み込めませんでした/.test(r.text), JSON.stringify(r));
    await sendMsg(page, '今日の相談', { text: '今日の返答です。' }); await waitIdle(page); await sleep(300);
    const t = await talk(page);
    r = await page.evaluate(() => ({ miss: !!document.querySelector('#talk-miss'), turns: window.__t.S.turns.map((x) => x.content), gets: window.__stub.gets.length }));
    note('stored talk', JSON.stringify(t));
    check('history recovered on the next save and kept in front', t.length === 6 && t[0] === '前回の相談その1' && t[5] === '今日の返答です。' && !r.miss && r.gets === 3, JSON.stringify(r));
  },
  async 'S3b talk read keeps failing → stored history untouched'(browser) {
    const { page } = await open(browser, { cfg: { seed: SEED({ [U + '/talk']: TALK }), dbGetFail: [U + '/talk'] } });
    await waitLoaded(page, 6000);
    await sendMsg(page, '今日の相談', { text: '今日の返答です。' }); await waitIdle(page); await sleep(300);
    const t = await talk(page);
    const miss = await page.evaluate(() => !!document.querySelector('#talk-miss'));
    check('stored history is not replaced; notice stays', t.length === 4 && t[0] === '前回の相談その1' && miss, JSON.stringify(t));
  },

  /* ---------- E2: one subscription silent ---------- */
  async 'S4 one subscription never answers'(browser) {
    const { page } = await open(browser, { cfg: { seed: SEED(), dbHang: [U + '/desk/projects'] } });
    await sleep(3000);
    let st = await state(page);
    check('still waiting at 3 s', !st.loaded);
    await sleep(7600);
    st = await state(page);
    check('usable after 10 s, with the note; settings loaded and savable', st.loaded && st.stale && /まだ読み込めていません/.test(st.banner) && st.gotDesk && st.mem === 3, JSON.stringify(st));
  },
  async 'S4b a subscription errors while another is silent'(browser) {
    const { page } = await open(browser, { cfg: { seed: SEED(), dbHang: [U + '/desk/projects'], dbFailListen: [U + '/desk/orders'] } });
    await sleep(10700);
    const st = await state(page);
    check('still becomes usable; error banner wins', st.loaded && st.dbError && /保存先につながりませんでした/.test(st.banner), JSON.stringify(st));
  },
  async 'S4c nothing answers'(browser) {
    const { page } = await open(browser, { cfg: { seed: SEED(), dbHang: [U + '/desk', U + '/desk/projects', U + '/desk/orders'], dbGetDelay: { [U + '/talk']: 600000 } } });
    await sleep(10600);
    const st = await state(page);
    check('10 s fallback as before', st.loaded && st.stale, JSON.stringify(st));
  },

  /* ---------- 2-3. before the store is chosen ---------- */
  async 'S5 capabilities still resolving (2.5 s)'(browser) {
    const { page } = await open(browser, { cfg: { seed: SEED(), useDelay: 2500 }, hash: '#ledger' });
    await sleep(500);
    let r = await page.evaluate(() => ({ add: document.querySelector('[data-key="add"]').disabled, loaded: window.__t.S.loaded }));
    check('"案件を追加" is disabled until loaded', r.add && !r.loaded, JSON.stringify(r));
    await page.click('.tab[data-tab="orders"]');
    r = await page.evaluate(() => [...document.querySelectorAll('#orders-body .btn.primary')].map((b) => b.disabled));
    check('"発注書を作る" is disabled until loaded', r.length === 1 && r[0] === true, JSON.stringify(r));
    await page.click('#open-settings'); await page.fill('#set-user', '高橋さん'); await page.press('#set-user', 'Tab');
    await page.fill('#mem-new', '準備中に足した記憶'); await page.press('#mem-new', 'Enter');
    await page.click('#dlg-settings [data-close]');
    const ls = await page.evaluate(() => localStorage.getItem('jarvis-desk-v1'));
    check('nothing written to this browser\'s local copy meanwhile', ls === null, String(ls).slice(0, 40));
    await waitLoaded(page, 6000); await sleep(300);
    const d = await desk(page);
    r = await page.evaluate(() => ({ add: document.querySelector('#ledger-body [data-key="add"]') && document.querySelector('#ledger-body [data-key="add"]').disabled, user: window.__t.S.prefs.userName }));
    check('early setting + memory merged into the stored desk', d.prefs.userName === '高橋さん' && d.prefs.length === 'normal' && d.memory.length === 4 && d.memory[3].text === '準備中に足した記憶', JSON.stringify({ u: d.prefs.userName, m: d.memory.length }));
    await page.click('.tab[data-tab="ledger"]');
    r = await page.evaluate(() => document.querySelector('#ledger-body [data-key="add"]').disabled);
    check('add button enabled after load', r === false);
  },
  async 'S5b local mode decided late (window.claude present, everything null)'(browser) {
    const saved = JSON.stringify({ prefs: { userName: '井上さん', length: 'normal' }, memory: [{ id: 'm1', text: '端末に保存済みの記憶', at: 1 }], projects: [{ id: 'pL', name: 'ローカルの案件', kind: 'work', status: 'spec', order: 1 }], orders: [], turns: [{ role: 'user', content: '前の相談', at: 1 }, { role: 'assistant', content: '前の返答', at: 2 }] });
    const { page } = await open(browser, { cfg: { absent: ['db', 'sample', 'tts', 'dictation', 'downloads', 'user'], useDelay: 1500 }, ls: { 'jarvis-desk-v1': saved } });
    await sleep(300);
    /* before the local copy is read the form shows defaults, so change a field whose stored value is not involved */
    await page.click('#open-settings'); await page.selectOption('#set-tier', 'complex'); await page.fill('#mem-new', '準備中の記憶'); await page.press('#mem-new', 'Enter');
    const shown0 = await page.inputValue('#set-length');
    await waitLoaded(page, 6000); await sleep(100);
    const shown1 = await page.inputValue('#set-length'); const note0 = await page.textContent('#store-note');
    await page.click('#dlg-settings [data-close]');
    check('open settings form refreshes when the stored copy arrives', shown0 === 'short' && shown1 === 'normal' && /この端末のブラウザにだけ/.test(note0), shown0 + ' → ' + shown1);
    const r = await page.evaluate(() => ({ ls: JSON.parse(localStorage.getItem('jarvis-desk-v1')), store: window.__t.S.store, banner: document.querySelector('#banner').innerText, turns: window.__t.S.turns.length, projects: window.__t.S.projects.length }));
    check('local data kept, early edits merged', r.store === 'local' && r.ls.memory.length === 2 && r.ls.prefs.length === 'normal' && r.ls.prefs.tier === 'complex' && r.ls.projects.length === 1 && r.turns === 2, JSON.stringify({ m: r.ls.memory.map((m) => m.text), len: r.ls.prefs.length, tier: r.ls.prefs.tier }));
    check('banner says this is a separate, device-only ledger', /この端末のブラウザだけに保存される別のもの/.test(r.banner), r.banner);
  },

  /* ---------- normal paths ---------- */
  async 'S6 first-time user (no stored desk) + cache-then-live'(browser) {
    let o = await open(browser, { cfg: {} });
    await waitLoaded(o.page);
    await o.page.click('#open-settings'); await o.page.selectOption('#set-length', 'normal'); await o.page.fill('#mem-new', 'はじめての記憶'); await o.page.press('#mem-new', 'Enter'); await sleep(250);
    let d = await desk(o.page);
    check('desk doc created with the change', d && d.prefs.length === 'normal' && d.memory.length === 1 && d.v === 1, JSON.stringify(d && d.prefs.length));
    await o.ctx.close();
    /* cached copy is older than the stored one: the stored one wins, cached edits are not written back */
    const stale = { v: 1, prefs: { userName: '古い名前' }, memory: [{ id: 'old', text: '古い控え', at: 0 }] };
    o = await open(browser, { cfg: { seed: SEED(), dbCache: { [U + '/desk']: stale }, dbFirstDelay: 1500 } });
    await sleep(500);
    let st = await o.page.evaluate(() => ({ user: window.__t.S.prefs.userName, mem: window.__t.S.memory.map((m) => m.text), got: window.__t.Got.desk }));
    check('cached copy displayed first', st.user === '古い名前' && !st.got, JSON.stringify(st));
    await o.page.click('#open-settings'); await o.page.selectOption('#set-tier', 'quick'); await o.page.click('#dlg-settings [data-close]');
    await sleep(2000);
    d = await desk(o.page);
    st = await o.page.evaluate(() => ({ user: window.__t.S.prefs.userName, mem: window.__t.S.memory.length }));
    check('live copy replaces the cache; the edit is applied on top of the live copy', d.prefs.userName === '井上さん' && d.prefs.tier === 'quick' && d.memory.length === 3 && st.user === '井上さん', JSON.stringify({ user: d.prefs.userName, tier: d.prefs.tier, mem: d.memory.length }));
    await o.ctx.close();
  },

  async 'S7 two saves in one reply under 400 ms latency + pref change'(browser) {
    const { page, logs } = await open(browser, { cfg: { seed: SEED(), dbLatency: 400 } });
    await waitLoaded(page, 6000);
    await sendMsg(page, '2つ覚えておいて', { text: '覚えました。\n<<<LEDGER\n[{"op":"remember","text":"メモA"},{"op":"remember","text":"メモB"}]\n>>>' }); await waitIdle(page);
    await page.evaluate(() => document.querySelector('#voice-toggle').click());
    await sleep(2200);
    const d = await desk(page);
    check('both memories and the pref survive', d.memory.length === 5 && d.prefs.voiceOn === true && d.prefs.length === 'normal', JSON.stringify(d.memory.map((m) => m.text)));
    check('no console errors (frozen snapshots never mutated)', logs.length === 0, logs.join(' / '));
  },

  async 'S8 write failures + listener error + null user'(browser) {
    let o = await open(browser, { cfg: { seed: SEED(), dbWriteFail: 'quota_exceeded' }, hash: '#ledger' });
    await waitLoaded(o.page);
    await o.page.click('[data-key="add"]'); await o.page.fill('#pj-name', '保存できない案件'); await o.page.click('#pj-save'); await sleep(250);
    let t = await toastInfo(o.page);
    check('quota message visible', !t.hidden && /上限に達しました/.test(t.text) && t.visible, JSON.stringify(t));
    await o.ctx.close();
    o = await open(browser, { cfg: { seed: SEED(), dbFailListen: [U + '/desk'] } });
    await waitLoaded(o.page);
    let st = await state(o.page);
    check('desk listener error → banner; desk never marked ready', st.dbError && !st.gotDesk && /保存されません/.test(st.banner), st.banner);
    await o.page.click('#open-settings'); await o.page.selectOption('#set-tier', 'quick'); await sleep(200);
    const w = await o.page.evaluate((u) => window.__stub.dbWrites.filter((x) => x.path === u + '/desk').length, U);
    check('no blind overwrite of the unseen desk doc', w === 0);
    await o.ctx.close();
    o = await open(browser, { cfg: { seed: SEED(), userId: null } });
    await waitLoaded(o.page); st = await state(o.page);
    check('null user id → local mode', st.store === 'local' && st.gotDesk && st.gotTalk);
    await o.ctx.close();
  },

  async 'S9 second device changes data while the page is open'(browser) {
    const { page } = await open(browser, { cfg: { seed: SEED() }, hash: '#ledger' });
    await waitLoaded(page);
    await page.evaluate((u) => { window.__stub.dbExternalWrite(u + '/desk', { v: 1, prefs: { userName: '井上さん', assistantName: 'フライデー' }, memory: [{ id: 'r1', text: '別の端末で足した', at: 9 }] }); window.__stub.dbExternalWrite(u + '/desk/projects/pZ', { name: '別端末の案件', kind: 'work', status: 'wait', order: 9 }); }, U);
    await sleep(100);
    const r = await page.evaluate(() => ({ plate: document.querySelector('#nameplate').innerText, mem: window.__t.S.memory.map((m) => m.text), tiles: document.querySelectorAll('.tile').length }));
    check('remote changes show up live', r.plate === 'フライデー' && r.mem.join() === '別の端末で足した' && r.tiles === 4, JSON.stringify(r));
  },
});
