const { open, sleep, waitLoaded, waitIdle, sendMsg, shot, check, note, run, toastInfo, overflow, U, SEED, TALK } = require('./lib.cjs');

const dlg = (page) => page.evaluate(() => ({ pj: document.querySelector('#dlg-project').open, set: document.querySelector('#dlg-settings').open, cf: document.querySelector('#dlg-confirm').open, cfText: document.querySelector('#cf-text').innerText, yes: document.querySelector('#cf-yes').innerText }));
const firstState = (page) => page.evaluate(() => window.__t.S.projects[0].state);

/* A scriptable speechSynthesis so the device-voice path can be followed in both browser behaviours. */
const FAKE_SS = (mode) => {
  const spoken = []; let queue = []; let cur = null;
  const pump = () => { if (cur || !queue.length) return; cur = queue.shift(); spoken.push(cur.text); const u = cur; u._t = setTimeout(() => { cur = null; if (u.onend) u.onend({}); pump(); }, 120); };
  class Utter { constructor(t) { this.text = t; } }
  Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: Utter, configurable: true });
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
    speak(u) { queue.push(u); pump(); },
    cancel() { const dropped = queue; queue = []; const c = cur; cur = null; if (c) { clearTimeout(c._t); setTimeout(() => { if (mode === 'error') { if (c.onerror) c.onerror({ error: 'interrupted' }); } else if (c.onend) c.onend({}); }, 0); } for (const d of dropped) setTimeout(() => { if (mode === 'error' && d.onerror) d.onerror({ error: 'canceled' }); }, 0); },
  } });
  window.__spoken = spoken;
};
const voice = (page) => page.evaluate(() => ({ presence: window.__t.S.presence, stopShown: !document.querySelector('#stop-voice').hidden, presenceShown: getComputedStyle(document.querySelector('#presence')).display !== 'none', tts: window.__stub.ttsState, toggle: !document.querySelector('#voice-toggle').hidden, stops: window.__stub.ttsStops }));

run({
  /* ---------- 5 + 8: toast in dialogs, closing the project dialog ---------- */
  async 'D1 project dialog: toast, guarded close, focus'(browser) {
    const { page, logs } = await open(browser, { cfg: { seed: SEED() }, hash: '#ledger' });
    await waitLoaded(page);
    await page.click('[data-key="add"]');
    await page.click('#pj-save'); await sleep(80);
    let t = await toastInfo(page);
    check('validation message is visible on top of the dialog', !t.hidden && t.visible && t.text === '名称を入れてください。', JSON.stringify(t));
    await shot(page, 'D1-toast-in-dialog');
    await page.fill('#pj-name', '新しい案件'); await page.fill('#pj-next', '要件を聞く');
    await page.click('#pj-save'); await sleep(150);
    let st = await page.evaluate(() => ({ open: document.querySelector('#dlg-project').open, names: window.__t.S.projects.map((p) => p.name), db: Object.keys(window.__stub.dbDump()).filter((k) => /projects/.test(k)).length }));
    check('new project saved (no confirm after saving)', !st.open && st.names.includes('新しい案件') && st.db === 4 && !(await dlg(page)).cf, JSON.stringify(st.names));
    t = await toastInfo(page);
    check('toast still visible after the dialog closed (moved back to the page)', t.hidden || t.visible, JSON.stringify(t));

    /* no edits → every close path closes at once */
    for (const how of ['x', 'escape', 'backdrop']) {
      await page.click('#ledger-body .tile >> nth=0'); await sleep(60);
      if (how === 'x') await page.click('#dlg-project [data-close]');
      if (how === 'escape') await page.keyboard.press('Escape');
      if (how === 'backdrop') await page.mouse.click(5, 5);
      await sleep(80);
      const d = await dlg(page);
      check('untouched form closes via ' + how + ' without asking', !d.pj && !d.cf, JSON.stringify(d));
    }
    const focus = await page.evaluate(() => (document.activeElement && document.activeElement.dataset.key) || document.activeElement.tagName);
    check('focus returns to the tile that opened the dialog', focus === 'tile:pA', focus);

    /* edits → ask first */
    const orig = await firstState(page);
    for (const how of ['x', 'escape', 'backdrop']) {
      await page.click('#ledger-body .row >> nth=0'); await sleep(60);
      await page.fill('#pj-state', '編集した内容。');
      if (how === 'x') await page.click('#dlg-project [data-close]');
      if (how === 'escape') await page.keyboard.press('Escape');
      if (how === 'backdrop') await page.mouse.click(5, 5);
      await sleep(100);
      let d = await dlg(page);
      check('edited form asks before closing via ' + how, d.pj && d.cf && /保存せずに閉じます/.test(d.cfText) && d.yes === '保存せずに閉じる', JSON.stringify(d));
      await page.click('#cf-no'); await sleep(80);
      d = await dlg(page);
      const kept = await page.inputValue('#pj-state');
      check('  "やめる" keeps the dialog and the text (' + how + ')', d.pj && !d.cf && kept === '編集した内容。');
      if (how === 'x') await page.click('#dlg-project [data-close]'); else if (how === 'escape') await page.keyboard.press('Escape'); else await page.mouse.click(5, 5);
      await sleep(100); await page.click('#cf-yes'); await sleep(100);
      d = await dlg(page);
      check('  "保存せずに閉じる" closes; ledger untouched (' + how + ')', !d.pj && !d.cf && (await firstState(page)) === orig);
    }
    /* drag that starts in a field and ends outside must not close */
    await page.click('#ledger-body .row >> nth=0'); await sleep(60);
    await page.fill('#pj-state', 'ドラッグで選択する文章。');
    const box = await page.locator('#pj-state').boundingBox();
    await page.mouse.move(box.x + 30, box.y + 12); await page.mouse.down(); await page.mouse.move(box.x + 10, 4, { steps: 6 }); await page.mouse.up(); await sleep(100);
    let d = await dlg(page);
    check('drag from a field to outside neither closes nor asks', d.pj && !d.cf && (await page.inputValue('#pj-state')) === 'ドラッグで選択する文章。', JSON.stringify(d));
    /* Escape on the confirm only cancels the confirm */
    await page.keyboard.press('Escape'); await sleep(80); d = await dlg(page);
    check('Escape with edits → confirm', d.pj && d.cf);
    await page.keyboard.press('Escape'); await sleep(80); d = await dlg(page);
    check('Escape on the confirm keeps the editor open', d.pj && !d.cf);
    await page.click('#pj-save'); await sleep(150);
    check('save after all that works', (await firstState(page)) === 'ドラッグで選択する文章。' && !(await dlg(page)).pj);
    /* delete */
    await page.click('#ledger-body .row:has-text("新しい案件")'); await page.click('#pj-delete'); await sleep(60);
    d = await dlg(page);
    check('delete asks first', d.cf && /新しい案件/.test(d.cfText) && d.yes === '削除する', d.cfText);
    await page.click('#cf-yes'); await sleep(200);
    st = await page.evaluate(() => ({ still: window.__t.S.projects.some((p) => p.name === '新しい案件'), db: Object.keys(window.__stub.dbDump()).filter((k) => /projects/.test(k)).length }));
    check('deleted from ledger + db', !st.still && st.db === 3);
    check('no console errors', logs.length === 0, logs.join(' / '));
  },

  async 'D2 toasts with the settings dialog open (desktop)'(browser) {
    const { page } = await open(browser, { cfg: { seed: SEED(), dbWriteFail: 'unavailable' }, viewport: { width: 1280, height: 800 } });
    await waitLoaded(page);
    await page.click('#open-settings');
    await page.fill('#mem-new', '保存に失敗するメモ'); await page.press('#mem-new', 'Enter'); await sleep(200);
    let t = await toastInfo(page);
    check('save failure is visible while settings are open', !t.hidden && t.visible && /保存できませんでした/.test(t.text), JSON.stringify(t));
    await shot(page, 'D2-toast-settings');
    await page.click('#clear-talk'); await sleep(60); await page.click('#cf-yes'); await sleep(120);
    t = await toastInfo(page);
    check('"会話を消しました" visible after the confirm closes', !t.hidden && t.visible && /会話を消しました/.test(t.text), JSON.stringify(t));
    await page.click('#dlg-settings [data-close]'); await sleep(80);
    t = await toastInfo(page);
    check('toast follows back to the page when the dialog closes', t.hidden || t.visible, JSON.stringify(t));
  },

  /* ---------- orders ---------- */
  async 'O1 orders: create, stop, refine, copy, save, delete'(browser) {
    const { page, logs } = await open(browser, { cfg: { seed: SEED() }, hash: '#orders' });
    await waitLoaded(page);
    await page.selectOption('#od-project', 'pA');
    await page.fill('#od-brief', 'ざっくり言うと、S2として温度の移動平均とCSV出力を追加したい。');
    const doc = '# 温度ロガーS2：移動平均とCSV出力\n\n## 目的\n金型温度の移動平均（窓幅30秒）を計算し、CSVに出力する。\n\n## 進め方\n1. S0：現状調査\n2. S1：移動平均の実装\n\n## 受け入れ基準\n- `pytest -q` が0件失敗\n- 出力CSVが3列\n\n## 未確認事項\n- サンプリング周期（未確認）';
    await page.evaluate((d) => window.__stub.replies.push({ text: d, chunkSize: 16 }), doc);
    await page.click('#orders-body .btn.primary'); await sleep(150);
    let st = await page.evaluate(() => ({ title: document.querySelector('dd.ttl').innerText, stopBtn: document.querySelector('#orders-body .btn-row .btn').innerText }));
    check('drafting view', st.title === '作成中' && st.stopBtn === '書くのを止める');
    await waitIdle(page); await sleep(150);
    st = await page.evaluate(() => ({ no: document.querySelector('#orders-body .tb dd').innerText, title: document.querySelector('dd.ttl').innerText, body: document.querySelector('#order-doc').innerText, n: window.__t.S.orders.length, call: window.__stub.calls[0], brief: window.__t.S.form.brief }));
    check('saved with number + title; numbers render', /^JV-\d{6}-01$/.test(st.no) && st.title === '温度ロガーS2：移動平均とCSV出力' && st.n === 1 && /窓幅30秒/.test(st.body) && /が0件失敗/.test(st.body), st.body.slice(0, 60));
    check('order written on the default tier despite "ざっくり"', st.call.modelTier === 'default' && typeof st.call.input === 'string' && /名称：金型温度ロガー/.test(st.call.input), st.call.modelTier);
    check('no horizontal overflow', (await overflow(page)).length === 0);
    await page.click('#orders-body button:has-text("コピー")'); await sleep(100);
    const clip = await page.evaluate(() => navigator.clipboard.readText().catch((e) => 'ERR ' + e.message));
    check('copy gives the markdown', clip === doc);
    await page.click('#orders-body button:has-text("ファイルに保存")'); await sleep(80);
    const dl = await page.evaluate(() => window.__stub.dlCalls[0]);
    check('download .md', /^JV-\d{6}-01\.md$/.test(dl.filename));
    await page.fill('#order-ask', 'S1を2つに分ける');
    await page.evaluate(() => window.__stub.replies.push({ text: '# 書き直し中\n\n' + 'あ'.repeat(600), chunkSize: 10, stepMs: 40 }));
    await page.click('#orders-body button:has-text("書き直してもらう")'); await sleep(350);
    await page.click('#orders-body button:has-text("書くのを止める")'); await waitIdle(page); await sleep(100);
    st = await page.evaluate(() => ({ title: document.querySelector('dd.ttl').innerText, roles: window.__stub.calls[1].input.map((t) => t.role).join(','), err: document.querySelectorAll('#orders-body .errline').length }));
    check('refine sends user,assistant,user; stop restores the old order', st.roles === 'user,assistant,user' && st.title === '温度ロガーS2：移動平均とCSV出力' && st.err === 0);
    await page.fill('#order-ask', 'S1を2つに分ける');
    await page.evaluate(() => window.__stub.replies.push({ text: '```markdown\n# 温度ロガーS2（改）\n\n## 目的\n改訂版。\n```' }));
    await page.click('#orders-body button:has-text("書き直してもらう")'); await waitIdle(page); await sleep(150);
    st = await page.evaluate(() => ({ title: document.querySelector('dd.ttl').innerText, body: window.__t.S.openOrder.body, n: window.__t.S.orders.length }));
    check('refine replaces the body, same order', st.title === '温度ロガーS2（改）' && !/```/.test(st.body) && st.n === 1);
    await page.click('#orders-body button:has-text("一覧に戻る")');
    await page.selectOption('#od-target', 'Microsoft 365 Copilot'); await sleep(50);
    const foc = await page.evaluate(() => document.activeElement && document.activeElement.id);
    const staged = await page.evaluate(() => !!document.querySelector('#od-staged'));
    check('changing the target keeps focus on the select; staged option hidden for Copilot', foc === 'od-target' && !staged, foc);
    await page.fill('#od-brief', '別件'); await page.evaluate(() => window.__stub.replies.push({ text: '# 別件の発注\n\n## 目的\nx' }));
    await page.click('#orders-body .btn.primary'); await waitIdle(page); await sleep(150);
    st = await page.evaluate(() => ({ no: document.querySelector('#orders-body .tb dd').innerText, tgt: window.__t.S.openOrder.target, prompt: window.__stub.calls[window.__stub.calls.length - 1].input }));
    check('second order -02 for Copilot', /-02$/.test(st.no) && st.tgt === 'Microsoft 365 Copilot' && /発注先はMicrosoft 365 Copilot/.test(st.prompt));
    await page.click('#orders-body button.danger:has-text("削除")'); await sleep(60); await page.click('#cf-yes'); await sleep(200);
    st = await page.evaluate(() => ({ n: window.__t.S.orders.length, db: Object.keys(window.__stub.dbDump()).filter((k) => /orders/.test(k)).length, list: document.querySelectorAll('#orders-body .sheet .row').length }));
    check('order deleted', st.n === 1 && st.db === 1 && st.list === 1, JSON.stringify(st));
    check('no console errors', logs.length === 0, logs.join(' / '));
  },

  /* ---------- 10: order from talk ---------- */
  async 'O2 "この相談を発注書にする" fills the form instead of drafting blindly'(browser) {
    const { page } = await open(browser, { cfg: { seed: SEED() } });
    await waitLoaded(page);
    await sendMsg(page, '手短に言うと、CSV出力を足したい', { text: '了解です。発注書にまとめましょうか。' }); await waitIdle(page);
    await page.click('.tab[data-tab="orders"]'); await page.selectOption('#od-target', 'Microsoft 365 Copilot'); await page.click('.tab[data-tab="talk"]');
    const before = await page.evaluate(() => window.__stub.calls.length);
    await page.click('#to-order'); await sleep(150);
    let st = await page.evaluate(() => ({ tab: window.__t.S.tab, busy: window.__t.S.busy, calls: window.__stub.calls.length, brief: document.querySelector('#od-brief').value, target: document.querySelector('#od-target').value, open: !!window.__t.S.openOrder }));
    const t = await toastInfo(page);
    check('goes to the form with the talk as the brief; nothing sent yet', st.tab === 'orders' && !st.busy && st.calls === before && /CSV出力を足したい/.test(st.brief) && /^次の相談の記録から/.test(st.brief) && !st.open, JSON.stringify({ tab: st.tab, calls: st.calls }));
    check('the target that will be used is on screen, with a hint', st.target === 'Microsoft 365 Copilot' && !t.hidden && t.visible && /発注先を確かめて/.test(t.text), JSON.stringify(t));
    await page.selectOption('#od-target', 'Claude Code');
    await page.evaluate(() => window.__stub.replies.push({ text: '# CSV出力の追加\n\n## 目的\nx' }));
    await page.click('#orders-body .btn.primary'); await waitIdle(page); await sleep(100);
    st = await page.evaluate(() => ({ target: window.__t.S.openOrder.target, tier: window.__stub.calls[window.__stub.calls.length - 1].modelTier }));
    check('order uses the chosen target and the default tier', st.target === 'Claude Code' && st.tier === 'default', JSON.stringify(st));
  },

  /* ---------- import ---------- */
  async 'I1 import a saved file'(browser) {
    const { page, logs } = await open(browser, { cfg: { seed: SEED() } });
    await waitLoaded(page);
    const file = { exportedAt: '2026-11-20T00:00:00Z', prefs: { userName: '別人さん' },
      memory: [{ id: 'x1', text: '報告は結論から', at: 1 }, { id: 'x2', text: '書き出しにあった記憶', at: 2 }],
      projects: [
        { id: 'pA', name: '金型温度ロガー', kind: 'work', status: 'run', summary: '書き出し時点の概要', state: '書き出し時点の現状', next: '', note: '', asOf: '2026-11-15', order: 1, createdAt: 1, updatedAt: 5 },
        { id: 'pN', name: '書き出しにだけある案件', kind: 'personal', status: 'constructor', order: 7 },
        { id: 'bad/../id', name: '変なid', status: 'wait', order: 8, state: 12345 },
        { id: 'pX', name: '   ' }, 'junk', null,
      ],
      orders: [{ id: 'oOld', no: 'JV-261101-01', title: '昔の発注', projectId: 'pA', projectName: '金型温度ロガー', target: '知らない発注先', staged: true, brief: '依頼', body: '# 昔の発注\n\n## 目的\nx', createdAt: 100, updatedAt: 100 }, { id: 'oEmpty', body: '' }],
      turns: [{ role: 'user', content: '書き出しの相談', at: 1 }, { role: 'assistant', content: '書き出しの返答', at: 2, acts: [{ label: 'x', undo: 'nope' }] }, { role: 'system', content: '' }] };
    await page.click('#open-settings');
    await page.setInputFiles('#import-file', { name: 'jarvis-desk-2026-11-20.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)) });
    await sleep(150);
    let d = await dlg(page);
    check('asks first, with counts', d.cf && /案件3件、発注書1件、覚えていること2件/.test(d.cfText) && /会話も戻します/.test(d.cfText) && d.yes === '読み込む', d.cfText);
    await page.click('#cf-yes'); await sleep(500);
    const r = await page.evaluate((u) => { const db = window.__stub.dbDump(); const S = window.__t.S; return {
      names: S.projects.map((p) => p.name + ':' + p.status), pA: db[u + '/desk/projects/pA'], pN: db[u + '/desk/projects/pN'], keys: Object.keys(db).filter((k) => /projects|orders/.test(k)).map((k) => k.split('/').slice(4).join('/')),
      mem: db[u + '/desk'].memory.map((m) => m.text), user: db[u + '/desk'].prefs.userName, order: db[u + '/desk/orders/oOld'], turns: S.turns.map((t) => t.role + ':' + t.content), talkDb: (db[u + '/talk'] || { turns: [] }).turns.length,
      memList: document.querySelectorAll('#mem-list li').length }; }, U);
    note('after import', JSON.stringify({ names: r.names, keys: r.keys, mem: r.mem }));
    check('same-id project overwritten, others kept, new ones added', r.pA.state === '書き出し時点の現状' && r.pA.status === 'run' && r.names.length === 5 && r.names.includes('湯流れ解析の比較:wait') && r.names.includes('書き出しにだけある案件:spec'));
    check('unsafe id replaced, bad fields cleaned, blank/junk rows skipped', r.keys.every((k) => /^(projects|orders)\/[A-Za-z0-9_-]+$/.test(k)) && !r.names.some((n) => /^\s*:/.test(n)) && r.names.includes('変なid:wait'), JSON.stringify(r.keys));
    check('memory merged without duplicates; settings not replaced', r.mem.length === 4 && r.mem.includes('書き出しにあった記憶') && r.user === '井上さん' && r.memList === 4, JSON.stringify(r.mem));
    check('order restored with a known target', r.order && r.order.title === '昔の発注' && r.order.target === 'Claude Code');
    check('talk restored because the current talk was empty', r.turns.join('|') === 'user:書き出しの相談|assistant:書き出しの返答' && r.talkDb === 2, r.turns.join('|'));
    const t = await toastInfo(page);
    check('"読み込みました" visible', !t.hidden && t.visible && t.text === '読み込みました。', JSON.stringify(t));
    /* not a saved file */
    await page.setInputFiles('#import-file', { name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"hello":1}') }); await sleep(120);
    const t2 = await toastInfo(page); d = await dlg(page);
    check('other files are refused with a message', !d.cf && /読み込めません/.test(t2.text), t2.text);
    await page.setInputFiles('#import-file', { name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('not json') }); await sleep(120);
    check('broken files are refused too', !(await dlg(page)).cf && /読み込めません/.test((await toastInfo(page)).text));
    /* second import: the talk is no longer empty → not replaced */
    await page.setInputFiles('#import-file', { name: 'again.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)) }); await sleep(150);
    d = await dlg(page);
    check('with a talk under way, it says the talk will not be restored', d.cf && /今回は戻しません/.test(d.cfText), d.cfText);
    await page.click('#cf-no'); await sleep(80);
    check('no console errors', logs.length === 0, logs.join(' / '));
  },

  async 'I2 import in local mode + export round trip'(browser) {
    const { page } = await open(browser, { cfg: { noClaude: true } });
    await waitLoaded(page);
    const file = { projects: [{ id: 'p1', name: 'ローカルに戻す案件', status: 'build', order: 1 }], memory: [{ text: 'ローカルの記憶' }], orders: [], turns: [] };
    await page.click('#open-settings');
    await page.setInputFiles('#import-file', { name: 'a.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)) }); await sleep(150);
    await page.click('#cf-yes'); await sleep(300);
    const ls = await page.evaluate(() => JSON.parse(localStorage.getItem('jarvis-desk-v1')));
    check('import works without Claude and is saved locally', ls.projects.length === 1 && ls.projects[0].name === 'ローカルに戻す案件' && ls.memory.length === 1, JSON.stringify(ls.projects.map((p) => p.name)));
  },

  /* ---------- voice ---------- */
  async 'V1 tts: read, stop, stop stays available, send stops the reading'(browser) {
    const { page, logs } = await open(browser, { cfg: { seed: SEED({ [U + '/desk']: { v: 1, prefs: { userName: '井上さん', voiceOn: true, voice: 'airy' }, memory: [] } }), ttsMs: 6000 }, viewport: { width: 320, height: 568 } });
    await waitLoaded(page);
    await sendMsg(page, '一つ目', { text: '一つ目の返答です。' }); await waitIdle(page); await sleep(150);
    const c = await page.evaluate(() => window.__stub.ttsCalls[0]);
    let v = await voice(page);
    check('reply is read with the chosen voice/language; own Stop shown, status text hidden', c.options.voice === 'airy' && c.options.language === 'ja' && v.tts !== 'idle' && v.stopShown && !v.presenceShown && v.presence === 'speaking', JSON.stringify(v));
    check('header fits at 320 px while Stop is shown', (await overflow(page)).length === 0, JSON.stringify(await overflow(page)));
    await shot(page, 'V1-speaking-320');
    /* review starts while the reading continues → Stop must stay */
    await page.click('.tab[data-tab="ledger"]');
    await page.evaluate(() => window.__stub.replies.push({ text: '**提案**：ひとつだけ。'.repeat(20), chunkSize: 10, stepMs: 60 }));
    await page.click('[data-key="review"]'); await sleep(400);
    v = await voice(page);
    check('while a review is being written the reading goes on and Stop is still there', v.tts !== 'idle' && v.stopShown && /thinking|writing/.test(v.presence), JSON.stringify(v));
    await page.click('#stop-voice'); await sleep(100);
    v = await voice(page);
    check('Stop ends the reading; status text is back', v.tts === 'idle' && !v.stopShown && v.presenceShown, JSON.stringify(v));
    await waitIdle(page);
    /* a new message stops the previous reading */
    await page.click('.tab[data-tab="talk"]');
    await sendMsg(page, '二つ目', { text: '二つ目の返答です。' }); await waitIdle(page); await sleep(150);
    v = await voice(page);
    check('reply 2 is being read', v.tts !== 'idle' && v.stopShown);
    const stopsBefore = v.stops;
    await sendMsg(page, '三つ目', { text: '三つ目の返答です。'.repeat(20), chunkSize: 10, stepMs: 60 }); await sleep(300);
    v = await voice(page);
    check('sending the next message stops the old reading', v.tts === 'idle' && !v.stopShown && v.stops === stopsBefore + 1, JSON.stringify(v));
    await waitIdle(page); await sleep(150);
    v = await voice(page);
    check('reply 3 is then read', v.tts !== 'idle' && v.stopShown);
    check('no console errors', logs.length === 0, logs.join(' / '));
  },

  async 'V2 reading turned off by the viewer'(browser) {
    for (const how of ['reject', 'state']) {
      const cfg = { seed: SEED({ [U + '/desk']: { v: 1, prefs: { userName: '井上さん', voiceOn: true, deviceVoice: true }, memory: [] } }) };
      if (how === 'reject') cfg.ttsReject = 'not_granted';
      const { page, ctx } = await open(browser, { cfg, init: { fn: FAKE_SS, arg: 'error' } });
      await waitLoaded(page);
      if (how === 'state') { await sendMsg(page, 'ゼロ', { text: '読み上げ中に切られる返答です。' }); await waitIdle(page); await sleep(100); await page.evaluate(() => { /* viewer switches it off in the Permissions menu */ window.claude.use('tts').then((t) => t.stop()); }); }
      await sendMsg(page, '一つ目', { text: '一つ目の返答です。' }); await waitIdle(page); await sleep(150);
      if (how === 'state') await page.evaluate(() => { window.__t.S.ttsOff || document.dispatchEvent(new Event('x')); });
      await page.click('#open-settings'); await sleep(60);
      const st = await page.evaluate(() => ({ off: window.__t.S.ttsOff, ttsRows: !document.querySelector('#set-voice-row').hidden, deviceRow: !document.querySelector('#set-device-row').hidden, test: !document.querySelector('#voice-test').hidden, toggle: !document.querySelector('#voice-toggle').hidden, note: document.querySelector('#voice-note').innerText, stop: !document.querySelector('#stop-voice').hidden }));
      await page.click('#dlg-settings [data-close]');
      await sendMsg(page, '二つ目', { text: '二つ目の返答です。' }); await waitIdle(page); await sleep(300);
      const spoken = await page.evaluate(() => window.__spoken.filter((s) => s.trim()));
      if (how === 'reject') {
        check('[reject] controls hidden, no device-voice offer, says why', st.off && !st.ttsRows && !st.deviceRow && !st.test && !st.toggle && !st.stop && /オフになっています/.test(st.note), JSON.stringify(st));
        check('[reject] nothing is read through the browser voice', spoken.length === 0, JSON.stringify(spoken));
      } else {
        check('[normal use] device voice is never used while Claude\'s reading exists', spoken.length === 0 && !st.deviceRow, JSON.stringify({ spoken, deviceRow: st.deviceRow }));
      }
      await ctx.close();
    }
  },

  async 'V3 device voice: overlap, stop, send'(browser) {
    for (const mode of ['error', 'end']) {
      const { page, ctx } = await open(browser, { cfg: { seed: SEED({ [U + '/desk']: { v: 1, prefs: { userName: '井上さん', voiceOn: true, deviceVoice: true }, memory: [] } }), absent: ['tts'] }, init: { fn: FAKE_SS, arg: mode } });
      await waitLoaded(page);
      const out = await page.evaluate(async () => {
        const t = window.__t; const wait = (ms) => new Promise((r) => setTimeout(r, ms));
        t.deviceSpeak('一つ目A。一つ目B。一つ目C。一つ目D。'); await wait(150);
        t.deviceSpeak('二つ目A。二つ目B。二つ目C。'); await wait(60);
        const mid = { speaking: t.P.speaking, stop: !document.querySelector('#stop-voice').hidden };
        await wait(700);
        return { spoken: window.__spoken.slice(), mid, after: { speaking: t.P.speaking, stop: !document.querySelector('#stop-voice').hidden } };
      });
      const tail = out.spoken.slice(out.spoken.indexOf('二つ目A。'));
      check('[' + mode + '] second reading is read whole and alone', JSON.stringify(tail) === JSON.stringify(['二つ目A。', '二つ目B。', '二つ目C。']) && !out.spoken.includes('一つ目C。'), JSON.stringify(out.spoken));
      check('[' + mode + '] Stop shown during, hidden after', out.mid.speaking && out.mid.stop && !out.after.speaking && !out.after.stop, JSON.stringify([out.mid, out.after]));
      /* stop in the middle */
      const stopped = await page.evaluate(async () => { const t = window.__t; const wait = (ms) => new Promise((r) => setTimeout(r, ms)); window.__spoken.length = 0; t.deviceSpeak('三A。三B。三C。三D。'); await wait(150); document.querySelector('#stop-voice').click(); await wait(500); return { spoken: window.__spoken.slice(), speaking: t.P.speaking }; });
      check('[' + mode + '] Stop halts the device reading', stopped.spoken.length <= 2 && !stopped.speaking, JSON.stringify(stopped));
      /* real flow: reply read by the device voice; the next send stops it */
      await page.evaluate(() => { window.__spoken.length = 0; });
      await sendMsg(page, '一つ目', { text: '返答一のA。返答一のB。返答一のC。返答一のD。返答一のE。' }); await waitIdle(page); await sleep(200);
      await sendMsg(page, '二つ目', { text: '返答二のA。返答二のB。' }); await waitIdle(page); await sleep(600);
      const flow = await page.evaluate(() => window.__spoken.filter((s) => s.trim()));
      const i2 = flow.indexOf('返答二のA。');
      check('[' + mode + '] send stops reply 1; reply 2 read whole', i2 > 0 && i2 <= 3 && JSON.stringify(flow.slice(i2)) === JSON.stringify(['返答二のA。', '返答二のB。']), JSON.stringify(flow));
      await ctx.close();
    }
  },

  async 'V4 dictation'(browser) {
    const { page, logs } = await open(browser, { cfg: { seed: SEED() } });
    await waitLoaded(page);
    await page.fill('#msg', '最初に打った文');
    await page.click('#mic'); await sleep(80);
    let st = await page.evaluate(() => ({ pressed: document.querySelector('#mic').getAttribute('aria-pressed'), presence: window.__t.S.presence }));
    check('listening', st.pressed === 'true' && st.presence === 'listening');
    await page.evaluate(() => window.__stub.dictSay('こんに', null));
    const p = await page.evaluate(() => document.querySelector('#partial').innerText);
    await page.evaluate(() => window.__stub.dictSay(null, ' こんにちは'));
    st = await page.evaluate(() => ({ v: document.querySelector('#msg').value, partial: document.querySelector('#partial').innerText }));
    check('partial shown, final appended', p === 'こんに' && st.v === '最初に打った文 こんにちは' && st.partial === '');
    /* sending while the mic is on: work state shows, and listening comes back afterwards if still on */
    await page.evaluate(() => window.__stub.replies.push({ text: 'はい。'.repeat(30), chunkSize: 6, stepMs: 40 }));
    await page.click('#send'); await sleep(200);
    st = await page.evaluate(() => window.__t.S.presence);
    check('work state wins while answering', /thinking|writing/.test(st), st);
    await waitIdle(page);
    st = await page.evaluate(() => window.__t.S.presence);
    check('back to "聞いています" while the mic is still on', st === 'listening', st);
    await page.click('#mic'); await sleep(100);
    st = await page.evaluate(() => ({ pressed: document.querySelector('#mic').getAttribute('aria-pressed'), presence: window.__t.S.presence }));
    check('second click stops', st.pressed === 'false' && st.presence === 'idle');
    await page.evaluate(() => window.__stub.dictEnd('not_granted')); await sleep(30);
    check('not_granted hides the mic', await page.evaluate(() => document.querySelector('#mic').hidden));
    check('no console errors', logs.length === 0, logs.join(' / '));
  },

  /* ---------- layout / keyboard ---------- */
  async 'Y1 layout: phone/desktop, light/dark'(browser) {
    for (const [name, viewport, colorScheme] of [['phone-light', { width: 375, height: 667 }, 'light'], ['phone-dark', { width: 375, height: 667 }, 'dark'], ['narrow-320', { width: 320, height: 568 }, 'light'], ['desktop', { width: 1280, height: 800 }, 'light']]) {
      const { page, ctx, logs } = await open(browser, { cfg: { seed: SEED() }, viewport, colorScheme, dsf: 2 });
      await waitLoaded(page);
      await sendMsg(page, 'https://example.com/very/long/url/' + 'x'.repeat(120) + ' と Supercalifragilisticexpialidocious_' + 'W'.repeat(80), {
        text: '結論から言うと、**S1の検証を先に**進めるべきです。*補足*もあります。\n\n- 理由1：判断待ちが1件\n- 理由2：`very_long_identifier_' + 'a'.repeat(70) + '`\n\n1. 手順A\n2. 手順B\n\n| 項目 | 現状 | 次の一手 | 備考 |\n|---|---|---|---|\n| 金型温度ロガー | S1実装中 | S1の検証 | センサー3点の取り付けまで完了 |\n\n```\n' + 'const veryLongLineOfCode = '.repeat(6) + '\n```\n台帳を更新します。\n<<<LEDGER\n[{"op":"update","id":"nope","state":"x"}]\n>>>',
      });
      await waitIdle(page); await sleep(100);
      const o1 = await overflow(page);
      check(name + ': talk', o1.length === 0, JSON.stringify(o1));
      await shot(page, 'Y1-' + name + '-talk');
      await page.click('.tab[data-tab="ledger"]'); await sleep(60);
      check(name + ': ledger', (await overflow(page)).length === 0);
      await page.click('#ledger-body .row >> nth=0'); await sleep(120);
      const dl = await page.evaluate(() => { const d = document.querySelector('#dlg-project').getBoundingClientRect(); return { top: d.top, bottom: d.bottom, vh: window.innerHeight, left: d.left, right: d.right, vw: window.innerWidth }; });
      check(name + ': project dialog fits', dl.top >= 0 && dl.bottom <= dl.vh && dl.left >= 0 && dl.right <= dl.vw);
      await page.click('#dlg-project [data-close]');
      await page.click('#open-settings'); await sleep(100);
      const sd = await page.evaluate(() => { const d = document.querySelector('#dlg-settings'); const r = d.getBoundingClientRect(); const b = d.querySelector('.dlg-body'); const imp = document.querySelector('#import').getBoundingClientRect(); return { fits: r.top >= 0 && r.bottom <= window.innerHeight && r.left >= 0 && r.right <= window.innerWidth, noX: b.scrollWidth <= b.clientWidth + 1, impInside: imp.left >= r.left && imp.right <= r.right }; });
      check(name + ': settings dialog fits, new button inside', sd.fits && sd.noX && sd.impInside, JSON.stringify(sd));
      await page.evaluate(() => { const b = document.querySelector('#dlg-settings .dlg-body'); b.scrollTop = b.scrollHeight; });
      await shot(page, 'Y1-' + name + '-settings');
      await page.click('#dlg-settings [data-close]');
      await page.click('.tab[data-tab="orders"]'); await sleep(60);
      check(name + ': orders', (await overflow(page)).length === 0);
      check(name + ': no console errors', logs.length === 0, logs.join(' / '));
      await ctx.close();
    }
  },

  async 'Y2 keyboard, routing, focus'(browser) {
    const { page } = await open(browser, { cfg: { seed: SEED() }, viewport: { width: 1000, height: 700 } });
    await waitLoaded(page);
    await page.focus('#msg'); await page.keyboard.type('一行目'); await page.keyboard.press('Enter'); await page.keyboard.type('二行目');
    let st = await page.evaluate(() => ({ v: document.querySelector('#msg').value, turns: window.__t.S.turns.length }));
    check('Enter = newline', st.v === '一行目\n二行目' && st.turns === 0);
    await page.keyboard.press('Control+Enter'); await waitIdle(page);
    check('Ctrl+Enter sends', (await page.evaluate(() => window.__t.S.turns.length)) === 2);
    await page.evaluate(() => { location.hash = 'ledger'; }); await sleep(60);
    check('hash routes', (await page.evaluate(() => window.__t.S.tab)) === 'ledger');
    await page.focus('[data-key="kind:work"]'); await page.keyboard.press('Enter'); await sleep(50);
    let f = await page.evaluate(() => ({ key: document.activeElement.dataset.key, pressed: document.activeElement.getAttribute('aria-pressed'), tiles: document.querySelectorAll('.tile').length }));
    check('filter toggled by keyboard keeps focus on the chip', f.key === 'kind:work' && f.pressed === 'true' && f.tiles === 2, JSON.stringify(f));
    await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); await page.keyboard.press('Enter'); await sleep(50);
    f = await page.evaluate(() => document.activeElement.dataset.key);
    note('next chips reachable by Tab', f);
    await page.goBack(); await sleep(80);
    check('back returns to talk', (await page.evaluate(() => window.__t.S.tab)) === 'talk');
  },
});
