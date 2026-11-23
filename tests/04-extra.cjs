const { open, sleep, waitLoaded, waitIdle, sendMsg, shot, check, note, run, toastInfo, overflow, U, SEED, TALK } = require('./lib.cjs');
run({
  async 'E1 reading switched off mid-way (idle with not_granted)'(browser) {
    const { page } = await open(browser, { cfg: { seed: SEED({ [U + '/desk']: { v: 1, prefs: { userName: '井上さん', voiceOn: true }, memory: [] } }), ttsMs: 6000 } });
    await waitLoaded(page);
    await sendMsg(page, '一つ目', { text: '一つ目の返答です。' }); await waitIdle(page); await sleep(150);
    await page.evaluate(() => window.__stub.ttsEnd('not_granted')); await sleep(60);
    const st = await page.evaluate(() => ({ off: window.__t.S.ttsOff, stop: !document.querySelector('#stop-voice').hidden, toggle: !document.querySelector('#voice-toggle').hidden, presence: window.__t.S.presence }));
    check('controls hidden, no Stop left behind', st.off && !st.stop && !st.toggle && st.presence === 'idle', JSON.stringify(st));
    const calls = await page.evaluate(() => window.__stub.ttsCalls.length);
    await sendMsg(page, '二つ目', { text: '二つ目の返答です。' }); await waitIdle(page); await sleep(150);
    check('no further speak() calls', (await page.evaluate(() => window.__stub.ttsCalls.length)) === calls);
  },
  async 'E2 talk read hangs while the rest is live'(browser) {
    const { page } = await open(browser, { cfg: { seed: SEED({ [U + '/talk']: TALK }), dbGetDelay: { [U + '/talk']: 13000 } } });
    await sleep(3000);
    let st = await page.evaluate(() => ({ loaded: window.__t.S.loaded, miss: !!document.querySelector('#talk-miss') }));
    check('still waiting at 3 s (talk not in yet)', !st.loaded && !st.miss, JSON.stringify(st));
    await sleep(7500);
    st = await page.evaluate(() => ({ loaded: window.__t.S.loaded, miss: !!document.querySelector('#talk-miss'), banner: document.querySelector('#banner').hidden ? '' : document.querySelector('#banner').innerText, mem: window.__t.S.memory.length }));
    check('usable at 10 s; says the talk is not in yet; no stale banner (ledger is live)', st.loaded && st.miss && st.banner === '' && st.mem === 3, JSON.stringify(st));
    await sendMsg(page, '待てない相談', { text: '返答です。' }); await waitIdle(page);
    await sleep(3200);
    const r = await page.evaluate((p) => ({ db: window.__stub.dbDump()[p].turns.map((t) => t.content), miss: !!document.querySelector('#talk-miss'), gets: window.__stub.gets.length }), U + '/talk');
    check('when it arrives: merged, saved, notice gone, no duplicate read', r.db.length === 6 && r.db[0] === '前回の相談その1' && r.db[4] === '待てない相談' && !r.miss && r.gets === 1, JSON.stringify(r));
  },
});
