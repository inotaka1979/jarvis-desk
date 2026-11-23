const { open, sleep, waitLoaded, waitIdle, sendMsg, check, note, run, U, SEED, TALK } = require('./lib.cjs');
const desk = (page) => page.evaluate((p) => window.__stub.dbDump()[p], U + '/desk');
run({
  async 'W1 only the saved copy ever arrives for the settings doc'(browser) {
    const cached = { v: 1, prefs: { userName: '井上さん', length: 'normal' }, memory: [{ id: 'c1', text: '控えにあった記憶1', at: 1 }, { id: 'c2', text: '控えにあった記憶2', at: 2 }] };
    const { page } = await open(browser, { cfg: { seed: SEED(), dbCache: { [U + '/desk']: cached }, dbHang: [U + '/desk'] } });
    await waitLoaded(page);
    await page.click('#open-settings'); await page.selectOption('#set-tier', 'complex'); await page.fill('#mem-new', '待ち時間に足した'); await page.press('#mem-new', 'Enter'); await page.click('#dlg-settings [data-close]');
    await sleep(10500);
    let st = await page.evaluate(() => ({ banner: document.querySelector('#banner').innerText, got: window.__t.Got.desk, w: window.__stub.dbWrites.filter((x) => /desk$/.test(x.path)).length }));
    check('at 10 s: note says changes are saved later; nothing written yet', /読み込めたあとに保存します/.test(st.banner) && !st.got && st.w === 0, JSON.stringify(st));
    await sleep(10200);
    st = await page.evaluate(() => ({ banner: document.querySelector('#banner').innerText, got: window.__t.Got.desk }));
    const d = await desk(page);
    note('stored desk after 20 s', JSON.stringify({ memory: d.memory.map((m) => m.text), tier: d.prefs.tier, length: d.prefs.length }));
    check('after 20 s the saved copy is used as the base: its memories are kept, the edits are saved', st.got && d.memory.length === 3 && d.memory[0].text === '控えにあった記憶1' && d.memory[2].text === '待ち時間に足した' && d.prefs.tier === 'complex' && d.prefs.length === 'normal');
    check('banner no longer says saving is postponed', /表示が古い可能性があります。$/.test(st.banner), st.banner);
  },
  async 'W2 no saved copy and nothing live → never writes blindly'(browser) {
    const { page } = await open(browser, { cfg: { seed: SEED(), dbHang: [U + '/desk'] } });
    await waitLoaded(page, 12000).catch(() => {});
    await sleep(11000);
    await page.click('#open-settings'); await page.selectOption('#set-tier', 'complex'); await page.click('#dlg-settings [data-close]');
    await sleep(21500);
    const st = await page.evaluate(() => ({ got: window.__t.Got.desk, w: window.__stub.dbWrites.filter((x) => /desk$/.test(x.path)).length, banner: document.querySelector('#banner').innerText }));
    const d = await desk(page);
    check('stored settings doc untouched (3 memories), still waiting', !st.got && st.w === 0 && d.memory.length === 3 && /読み込めたあとに保存します/.test(st.banner), JSON.stringify(st));
  },
});
