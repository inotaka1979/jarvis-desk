const { open, sleep, waitLoaded, waitIdle, sendMsg, shot, check, note, run, toastInfo, overflow, U, SEED, TALK } = require('./lib.cjs');

run({
  /* ---------- 1. markdown / placeholder ---------- */
  async 'M1 md(): numbers, code, emphasis, lists'(browser) {
    const { page, logs } = await open(browser, { cfg: {} });
    await waitLoaded(page);
    const r = await page.evaluate(() => {
      const md = window.__t.md; const o = {};
      o.nums = md('S1は3件、残りは12件です。`npm test` を実行。**2026年**の計画。');
      o.codeDigits = md('`pytest -q` が0件失敗、`a1` と 10');
      o.xss = md('<img src=x onerror=alert(1)> **<b>x</b>** `<i>` [a](javascript:alert(1)) [b](https://e.com/?q="><script>)');
      o.em = md('これは *強調* と _下線_ です。*先頭*から');
      o.emNot = md('5*3=15, 2*4=8 と a * b * c と snake_case_name');
      o.boldEm = md('**太字**と*強調*と**太字2**');
      o.codeStar = md('`a*b*c` はそのまま');
      o.mixed = md('- 理由A\n- 理由B\n\n1. まずこれ\n2. 次にこれ\n- また箇条書き');
      o.nested = md('- a\n  1. b1\n  2. b2\n- c');
      o.pua = md('生の \uE000' + '0' + '\uE001 が来た `x`');
      o.table = md('| 項目 | 値 |\n|---|---|\n| A | 1 |');
      o.fence = md('```js\nconst a = "<b>" * 2;\n```\nafter *x*');
      o.star = md('* item one\n* item *two*');
      o.source = [...document.querySelector('script:not([src])').textContent].filter((c) => { const n = c.codePointAt(0); return (n < 32 && c !== '\n' && c !== '\t') || (n >= 0xE000 && n <= 0xF8FF); }).length;
      return o;
    });
    for (const [k, v] of Object.entries(r)) note(k, String(v));
    check('numbers and code spans', r.nums === '<p>S1は3件、残りは12件です。<code>npm test</code> を実行。<strong>2026年</strong>の計画。</p>');
    check('digits next to code spans', r.codeDigits === '<p><code>pytest -q</code> が0件失敗、<code>a1</code> と 10</p>');
    check('no raw html survives', !/<img|<script|<b>|<i>/.test(r.xss) && !/href="javascript/.test(r.xss));
    check('*x* becomes emphasis, _x_ stays', /<em>強調<\/em>/.test(r.em) && /_下線_/.test(r.em) && /<em>先頭<\/em>/.test(r.em));
    check('arithmetic and snake_case are left alone', !/<em>/.test(r.emNot), r.emNot);
    check('bold and emphasis together', r.boldEm === '<p><strong>太字</strong>と<em>強調</em>と<strong>太字2</strong></p>');
    check('asterisks inside code stay', r.codeStar === '<p><code>a*b*c</code> はそのまま</p>');
    check('bullets then numbers then bullets = 3 lists', r.mixed === '<ul><li>理由A</li><li>理由B</li></ul><ol><li>まずこれ</li><li>次にこれ</li></ol><ul><li>また箇条書き</li></ul>');
    check('nested ordered list inside bullets', r.nested === '<ul><li>a<ol><li>b1</li><li>b2</li></ol></li><li>c</li></ul>');
    check('stray private-use characters in a reply cannot break code spans', r.pua === '<p>生の 0 が来た <code>x</code></p>', r.pua);
    check('source has no invisible characters', r.source === 0, String(r.source));
    check('no console errors', logs.length === 0, logs.join(' / '));
  },

  async 'M2 ledger block: fences, commas, single object'(browser) {
    const { page } = await open(browser, { cfg: {} });
    await waitLoaded(page);
    const r = await page.evaluate(() => {
      const { splitLedger, parseActions } = window.__t; const o = {};
      const full = '台帳を更新します。\n<<<LEDGER\n[{"op":"update","id":"pA","status":"run"}]\n>>>';
      o.full = splitLedger(full, false);
      o.flash = []; for (let i = 1; i <= full.length; i++) { const s = splitLedger(full.slice(0, i), true).body; if (/<<|LEDGER|\[\{/.test(s)) o.flash.push(s); }
      o.fenced = splitLedger('了解です。\n```\n<<<LEDGER\n[{"op":"remember","text":"x"}]\n>>>\n```', false);
      o.fencedJson = splitLedger('了解です。\n```json\n<<<LEDGER\n[{"op":"remember","text":"x"}]\n>>>\n```', false).body;
      o.keepFence = splitLedger('例です。\n```\ncode\n```\n<<<LEDGER\n[]\n>>>', false).body;
      o.comma = parseActions('[{"op":"remember","text":"a, ]"},]');
      o.curly = parseActions('[{\u201Cop\u201D:\u201Cremember\u201D,\u201Ctext\u201D:\u201Cb\u201D}]');
      o.single = parseActions('\n{"op":"remember","text":"c"}\n');
      o.cut = parseActions('[{"op":"remember","text":"x"},{"op":"upd');
      return o;
    });
    check('block removed, body kept', r.full.body === '台帳を更新します。' && r.flash.length === 0);
    check('code fence around the block is not left open in the body', r.fenced.body === '了解です。' && r.fencedJson === '了解です。', JSON.stringify([r.fenced.body, r.fencedJson]));
    check('a real code block before the ledger block is kept', r.keepFence === '例です。\n```\ncode\n```', JSON.stringify(r.keepFence));
    check('trailing comma tolerated without touching the text', r.comma.length === 1 && r.comma[0].text === 'a, ]', JSON.stringify(r.comma));
    check('curly quotes tolerated', r.curly.length === 1 && r.curly[0].text === 'b', JSON.stringify(r.curly));
    check('single object accepted', r.single.length === 1 && r.single[0].text === 'c');
    check('truncated block gives nothing', r.cut.length === 0);
  },

  /* ---------- core flows (regression) ---------- */
  async 'C1 chat: stream, ledger update, undo, persistence'(browser) {
    const { page, logs } = await open(browser, { cfg: { seed: SEED() } });
    await waitLoaded(page);
    await sendMsg(page, '金型温度ロガーはS1の検証が終わりました。次はS2です。あと、報告は箇条書き3点までと覚えておいて。', {
      text: '承知しました。S2に進みます。台帳を更新します。\n<<<LEDGER\n[{"op":"update","id":"pA","status":"build","state":"S1検証完了","next":"S2の着手"},{"op":"add","name":"治具の見直し","kind":"work","status":"spec","summary":"治具を見直す","next":"現状の整理"},{"op":"remember","text":"報告は箇条書き3点まで"}]\n>>>',
      chunkSize: 9,
    });
    await sleep(120);
    const mid = await page.evaluate(() => ({ busy: window.__t.S.busy, sendHidden: document.querySelector('#send').hidden, stopHidden: document.querySelector('#stop').hidden, presence: document.querySelector('#presence-text').textContent, state: document.querySelector('#presence').dataset.state }));
    check('busy: stop button + presence', mid.busy && mid.sendHidden && !mid.stopHidden && /考えています|書いています/.test(mid.presence), JSON.stringify(mid));
    await waitIdle(page); await sleep(200);
    const call = await page.evaluate(() => window.__stub.calls[0]);
    check('input starts & ends on user, cache:false', call.input[0].role === 'user' && call.input[call.input.length - 1].role === 'user' && call.cache === false);
    const st = await page.evaluate(() => ({
      body: document.querySelector('.turn.jv:last-of-type .md').innerText, acts: [...document.querySelectorAll('.applied p')].map((p) => p.innerText),
      miss: [...document.querySelectorAll('.turn.jv:last-of-type .fine')].map((p) => p.innerText),
      projects: window.__t.S.projects.map((p) => p.name + ':' + p.status + ':' + p.state + ':' + p.next), memory: window.__t.S.memory.map((m) => m.text), presence: window.__t.S.presence,
    }));
    check('block hidden, 3 actions applied, no miss note', !/LEDGER/.test(st.body) && st.acts.length === 3 && st.miss.length === 0, JSON.stringify(st.acts));
    check('project updated + added, memory added', st.projects.some((p) => /金型温度ロガー:build:S1検証完了:S2の着手/.test(p)) && st.projects.some((p) => /治具の見直し:spec/.test(p)) && st.memory.includes('報告は箇条書き3点まで'));
    check('presence back to idle', st.presence === 'idle');
    const dump = await page.evaluate(() => window.__stub.dbDump());
    check('db: project, memory (4), talk (2 turns, no block)', dump[U + '/desk/projects/pA'].state === 'S1検証完了' && dump[U + '/desk'].memory.length === 4 && dump[U + '/talk'].turns.length === 2 && !/LEDGER/.test(JSON.stringify(dump[U + '/talk'])));
    check('db: other prefs untouched', dump[U + '/desk'].prefs.length === 'normal' && !!dump[U + '/desk'].prefs.review);
    await page.click('.applied p:nth-child(3) button'); await sleep(200);   /* undo the memory */
    await page.click('.applied p:nth-child(1) button'); await sleep(200);   /* undo the update */
    const after = await page.evaluate(() => ({ p: window.__t.S.projects.find((p) => p.id === 'pA'), mem: window.__stub.dbDump()['data/users/u_test1/desk'].memory.length }));
    check('undo restores project and memory', after.p.state.startsWith('S1実装中') && after.p.asOf === '2026-11-01' && after.mem === 3, JSON.stringify({ s: after.p.state, m: after.mem }));
    await page.reload(); await waitLoaded(page);
    const re = await page.evaluate(() => ({ turns: window.__t.S.turns.length, projects: window.__t.S.projects.length, memory: window.__t.S.memory.length }));
    check('reload restores everything', re.turns === 2 && re.projects === 4 && re.memory === 3, JSON.stringify(re));
    check('no console errors', logs.length === 0, logs.join(' / '));
  },

  async 'C2 stop / errors / stale retry links'(browser) {
    const { page } = await open(browser, { cfg: { seed: SEED() } });
    await waitLoaded(page);
    await sendMsg(page, '長い説明をお願いします', { text: 'あ'.repeat(40) + 'い'.repeat(40) + 'う'.repeat(400), chunkSize: 10, stepMs: 40 });
    await sleep(400); await page.click('#stop'); await waitIdle(page);
    let st = await page.evaluate(() => ({ turns: window.__t.S.turns.map((t) => t.role + (t.stopped ? ':stopped' : '')), err: document.querySelectorAll('.errline').length }));
    check('stop keeps the partial', st.turns.join(',') === 'user,assistant:stopped' && st.err === 0, JSON.stringify(st));
    await sendMsg(page, '最初の質問', { text: 'x', error: { code: 'upstream_error' } }); await waitIdle(page);
    st = await page.evaluate(() => document.querySelectorAll('.errline button').length);
    check('failure shows a retry link', st === 1);
    await sendMsg(page, '次の質問', { text: '次の質問への大事な返答です。' }); await waitIdle(page);
    st = await page.evaluate(() => ({ links: document.querySelectorAll('.errline').length, last: window.__t.S.turns[window.__t.S.turns.length - 1].content }));
    check('old retry link is gone once the talk moves on', st.links === 0 && /大事な返答/.test(st.last), JSON.stringify(st));
    await sendMsg(page, 'もう一度', { text: 'x', error: { code: 'rate_limited', reason: 'usage_limit' } }); await waitIdle(page);
    await page.evaluate(() => window.__stub.replies.push({ text: '再送に成功しました。' }));
    await page.click('.errline button'); await waitIdle(page);
    st = await page.evaluate(() => window.__t.S.turns.slice(-2).map((t) => t.role + ':' + t.content));
    check('retry of the latest failure still works', st.join('|') === 'user:もう一度|assistant:再送に成功しました。', st.join('|'));
    await sendMsg(page, '最後', { text: 'x', error: { code: 'not_granted' } }); await waitIdle(page);
    st = await page.evaluate(() => ({ banner: document.querySelector('#banner').innerText, send: document.querySelector('#send').disabled, retry: document.querySelectorAll('.errline button').length }));
    check('not_granted disables sending, no retry', st.send && /許可がありません/.test(st.banner) && st.retry === 0, JSON.stringify(st));
  },

  /* ---------- 6. ledger block that cannot be applied ---------- */
  async 'L1 ledger miss notices + id/name fallback'(browser) {
    const { page } = await open(browser, { cfg: { seed: SEED() } });
    await waitLoaded(page);
    const ask = async (text) => { await sendMsg(page, '報告', { text }); await waitIdle(page); return page.evaluate(() => ({ fine: [...document.querySelectorAll('.turn.jv:last-of-type .fine')].map((n) => n.innerText), applied: [...document.querySelectorAll('.turn.jv:last-of-type .applied p')].map((n) => n.innerText.replace(/\s*取り消す$/, '')), state: window.__t.S.projects.find((p) => p.id === 'pA').state, body: document.querySelector('.turn.jv:last-of-type .md').innerText })); };
    let r = await ask('台帳を更新します。\n<<<LEDGER\n[{"op":"update","id":"id:pA","state":"接頭辞つきのid"}]\n>>>');
    check('id written as "id:pA" still matches', r.state === '接頭辞つきのid' && r.applied.length === 1 && r.fine.length === 0, JSON.stringify(r));
    r = await ask('台帳を更新します。\n<<<LEDGER\n[{"op":"update","id":"金型温度ロガー","state":"名称で指定"}]\n>>>');
    check('unique name in place of the id matches', r.state === '名称で指定' && r.applied.length === 1, JSON.stringify(r));
    r = await ask('台帳を更新します。\n<<<LEDGER\n[{"op":"update","id":"zzz","state":"存在しない"}]\n>>>');
    check('unknown project → told that nothing was applied', r.applied.length === 0 && r.fine.some((t) => /1件は反映できませんでした/.test(t)), JSON.stringify(r.fine));
    r = await ask('台帳を更新します。\n<<<LEDGER\n[{"op":"update","id":"pA","state":"末尾カンマ",}]\n>>>');
    check('trailing comma is applied', r.state === '末尾カンマ' && r.fine.length === 0, JSON.stringify(r));
    r = await ask('台帳を更新します。\n<<<LEDGER\n[{"op":"update","id":"pA","state":"途中で切');
    check('unreadable block → told the ledger did not change', r.state === '末尾カンマ' && r.fine.some((t) => /読み取れなかった/.test(t)), JSON.stringify(r.fine));
    r = await ask('<<<LEDGER\n[{"op":"update","id":"pA","status":"build"}]\n>>>');
    check('no-op update: no notice, honest body', r.fine.length === 0 && r.applied.length === 0 && r.body === '返答の本文がありませんでした。', JSON.stringify(r));
    r = await ask('一部だけ。\n<<<LEDGER\n[{"op":"update","id":"pA","state":"一部成功"},{"op":"update","id":"nope","state":"x"},{"op":"frobnicate"}]\n>>>');
    check('partial: applied one, 2 reported', r.state === '一部成功' && r.applied.length === 1 && r.fine.some((t) => /2件は反映できませんでした/.test(t)), JSON.stringify(r));
    await sleep(300); await page.reload(); await waitLoaded(page);
    const kept = await page.evaluate(() => [...document.querySelectorAll('.turn.jv .fine')].filter((n) => /反映できませんでした|読み取れなかった/.test(n.innerText)).length);
    check('notices survive a reload', kept === 3, String(kept));
  },

  /* ---------- 4. context with a long pasted turn ---------- */
  async 'X1 long pasted turn keeps the exchange in context'(browser) {
    const { page } = await open(browser, { cfg: { seed: SEED() } });
    await waitLoaded(page);
    await sendMsg(page, '次の仕様書を読んで要点を教えてください。\n' + '仕様の本文です。'.repeat(2600), { text: '要点は3つです。' + '詳しい説明。'.repeat(1300), chunkSize: 600, stepMs: 5 }); await waitIdle(page);
    await sendMsg(page, '2点目を詳しく', { text: '2点目は…' }); await waitIdle(page);
    let c = await page.evaluate(() => { const c = window.__stub.calls[1]; return { turns: c.input.map((t) => t.role + ':' + t.content.length), bytes: c.bytes, tier: c.modelTier }; });
    note('follow-up input', JSON.stringify(c));
    check('follow-up carries the pasted question and the answer in full', c.turns.length === 4 && c.turns[1] === 'user:20821' && c.turns[2] === 'assistant:7808' && c.bytes < 250000, c.turns.join(' | '));
    /* a paste bigger than the whole budget is trimmed in the middle, and the user is told */
    await sendMsg(page, 'あ'.repeat(10) + 'い'.repeat(79980) + 'う'.repeat(10), { text: '受け取りました。' }); await waitIdle(page);
    c = await page.evaluate(() => { const c = window.__stub.calls[2]; const last = c.input[c.input.length - 1].content; return { n: c.input.length, lastLen: last.length, head: last.slice(0, 10), tail: last.slice(-10), mark: /長いため中略/.test(last), bytes: c.bytes, note: [...document.querySelectorAll('.ctx-note')].map((n) => n.innerText) }; });
    note('oversized message', JSON.stringify(c));
    check('oversized newest message: head and tail kept, under the cap, note shown', c.head === 'あ'.repeat(10) && c.tail === 'う'.repeat(10) && c.mark && c.bytes < 250000 && c.note.length === 1, JSON.stringify({ len: c.lastLen, bytes: c.bytes }));
    await sendMsg(page, '続き', { text: 'はい。' }); await waitIdle(page);
    c = await page.evaluate(() => { const c = window.__stub.calls[3]; return { turns: c.input.map((t) => t.role + ':' + t.content.length), bytes: c.bytes, notes: document.querySelectorAll('.ctx-note').length }; });
    note('next turn after the oversized one', JSON.stringify(c));
    check('later turns stay under the cap; old note cleared', c.bytes < 250000 && c.notes === 0 && c.turns.length >= 3);
    /* storage keeps long turns longer than before */
    const saved = await page.evaluate((p) => { const t = window.__stub.dbDump()[p]; return { n: t.turns.length, first: t.turns[0].content.length, bytes: new TextEncoder().encode(JSON.stringify(t)).length }; }, U + '/talk');
    note('stored talk', JSON.stringify(saved));
    check('stored talk doc under 256 KiB', saved.bytes < 262144);
  },

  async 'X2 huge ledger shrinks the talk budget instead of failing'(browser) {
    const big = {}; for (let i = 0; i < 60; i++) big[U + '/desk/projects/q' + i] = { name: '案件' + i, kind: 'work', status: 'spec', summary: '概'.repeat(400), state: '現'.repeat(400), next: '次'.repeat(400), note: '', asOf: '2026-11-01', order: 10 + i, createdAt: i, updatedAt: i };
    const { page } = await open(browser, { cfg: { seed: SEED(big) } });
    await waitLoaded(page);
    await sendMsg(page, '長い話'.repeat(4000), { text: 'はい。' }); await waitIdle(page);
    await sendMsg(page, '続き', { text: 'はい。' }); await waitIdle(page);
    const c = await page.evaluate(() => window.__stub.calls.map((c) => ({ bytes: c.bytes, n: c.input.length })));
    note('calls', JSON.stringify(c));
    check('every call stays under 256 KiB', c.every((x) => x.bytes < 262144));
    const err = await page.evaluate(() => document.querySelectorAll('.errline').length);
    check('no prompt_too_large', err === 0);
  },

  /* ---------- 9. model tier ---------- */
  async 'T1 tiers'(browser) {
    const { page } = await open(browser, { cfg: { seed: SEED() } });
    await waitLoaded(page);
    const t = await page.evaluate(() => { const p = window.__t.pickTier; return { hai: p('はい', 'talk'), cont: p('続けて', 'talk'), go: p('それで進めてください', 'talk'), thanks: p('ありがとう', 'talk'), deep: p('じっくり考えて比較して', 'talk'), brief: p('手短に教えて', 'talk'), order: p('ざっくり言うと、日報の集計を自動化したい。', 'order'), order2: p('多角的に検討した結果、A案を実装する。', 'order'), review: p('', 'review') }; });
    note('tiers', JSON.stringify(t));
    check('short replies no longer drop to the quick tier', t.hai === 'default' && t.cont === 'default' && t.go === 'default');
    check('thanks is quick; explicit words still switch a talk turn', t.thanks === 'quick' && t.deep === 'complex' && t.brief === 'quick');
    check('orders and reviews ignore the words', t.order === 'default' && t.order2 === 'default' && t.review === 'default');
    await sendMsg(page, 'じっくり考えて、S1とS2の順番を比較して', { text: '比較しました。', tier: 'complex', truncated: true }); await waitIdle(page);
    await sendMsg(page, '続けて', { text: '続きです。' }); await waitIdle(page);
    const tiers = await page.evaluate(() => window.__stub.calls.map((c) => c.modelTier));
    check('"続けて" after a deep answer keeps the depth', tiers.join(',') === 'complex,complex', tiers.join(','));
    await page.click('#open-settings'); await page.selectOption('#set-tier', 'quick'); await page.click('#dlg-settings [data-close]');
    const pref = await page.evaluate(() => { const p = window.__t.pickTier; return [p('普通の質問です、どう思いますか', 'talk'), p('依頼文', 'order'), p('じっくり考えて', 'talk')]; });
    check('setting applies to talk and orders; explicit word still wins in talk', pref.join(',') === 'quick,quick,complex', pref.join(','));
  },

  /* ---------- automatic model choice by content ---------- */
  async 'T2 automatic model choice by content'(browser) {
    const { page } = await open(browser, { cfg: { seed: SEED() } });
    await waitLoaded(page);
    const cases = [
      ['quick', 'おはようございます'], ['quick', 'ありがとう、助かりました'], ['quick', '判断待ちは何件？'], ['quick', '金型温度ロガーの次の一手は？'], ['quick', 'なるほど'],
      ['default', '今日は何から手を付けるべきですか。台帳を見て、理由と一緒に教えてください。'], ['default', '金型温度ロガーはS1の検証が終わりました。'], ['default', 'この治具、どうすれば軽くできますか？'],
      ['default', 'はい、お願いします'], ['default', '2点目を詳しく'], ['default', 'それ、覚えておいて'], ['default', 'S2に進めていいか迷っています'],
      ['default', 'ログを貼ります。\n```\nError: timeout\n```\nなぜ落ちる？どう直す？'],
      ['complex', 'A案とB案を比較して、リスクと対策を整理してください'], ['complex', '湯流れ解析の結果が合わない原因を分析して、対策の優先順位を付けたい'], ['complex', 'S2の設計方針を検討したい'],
      ['complex', '次の仕様を読んで、要件の抜けを挙げてください。\n' + '温度は1秒ごとに記録する。'.repeat(60)],
    ];
    const got = await page.evaluate((list) => list.map(([, text]) => window.__t.pickTier(text, 'talk')), cases);
    const wrong = cases.map(([want, text], i) => (got[i] === want ? null : text.slice(0, 24) + ' → ' + got[i] + ' (want ' + want + ')')).filter(Boolean);
    check('everyday talk → quick, consultations → default, analysis/design → complex', wrong.length === 0, wrong.join(' / '));
    const other = await page.evaluate(() => { const p = window.__t.pickTier; return { orderLight: p('日報の集計を自動化したい。', 'order'), orderHeavy: p('湯流れ解析の比較結果をもとに、設計方針とリスク対策を仕様にまとめたい。', 'order'), review: p('', 'review') }; });
    check('orders: default, or complex when the brief is involved; never quick', other.orderLight === 'default' && other.orderHeavy === 'complex' && other.review === 'default', JSON.stringify(other));
    /* the choice is used for the call, shown while working, and recorded under the reply */
    await sendMsg(page, 'おはようございます', { text: 'おはようございます。' }); await waitIdle(page);
    await sendMsg(page, 'A案とB案を比較して、リスクと対策を整理してください', { text: '比較しました。'.repeat(30), chunkSize: 8, stepMs: 40, thinkMs: 500 }); await sleep(250);
    const mid = await page.evaluate(() => ({ head: document.querySelector('#presence-text').textContent, bubble: document.querySelector('.turn.jv:last-of-type').innerText }));
    await waitIdle(page);
    await sendMsg(page, '2点目を詳しく', { text: '2点目です。' }); await waitIdle(page);
    const r = await page.evaluate(() => ({ tiers: window.__stub.calls.map((c) => c.modelTier), notes: [...document.querySelectorAll('.turn.jv:not(.hello)')].map((n) => [...n.querySelectorAll('.fine')].map((f) => f.innerText).join('|')), head: document.querySelector('#presence-text').textContent }));
    check('calls use quick → complex → complex (follow-up keeps the depth)', r.tiers.join(',') === 'quick,complex,complex', r.tiers.join(','));
    check('status says "じっくり考えています" while a deep answer is prepared', mid.head === 'じっくり考えています' && /じっくり考えています/.test(mid.bubble), JSON.stringify(mid));
    check('each reply shows which model answered', r.notes[0] === '速いモデルで答えました。' && r.notes[1] === 'じっくり考えて答えました。' && r.notes[2] === 'じっくり考えて答えました。' && r.head === '待機中', JSON.stringify(r.notes));
    /* rules: confirm important things first */
    const prompts = await page.evaluate(() => { const t = window.__t; const o = { target: 'Claude Code', staged: true, brief: 'x' }; return { rules: t.rulesText(), cc: t.orderPrompt(o, null), cp: t.orderPrompt({ target: 'Microsoft 365 Copilot', brief: 'x' }, null) }; });
    check('talk rules and order rules carry the confirm-first rule', /金額の決定、社外への公開や送信、個人情報の取り扱い/.test(prompts.rules) && /実行の前に停止して承認を待つ/.test(prompts.cc) && /行う前に確認を求める/.test(prompts.cp));
    await sleep(250); await page.reload(); await waitLoaded(page);
    const kept = await page.evaluate(() => [...document.querySelectorAll('.turn.jv .fine')].map((f) => f.innerText));
    check('model notes survive a reload', kept.filter((t) => t === '速いモデルで答えました。').length === 1 && kept.filter((t) => t === 'じっくり考えて答えました。').length === 2, JSON.stringify(kept));
  },
});
