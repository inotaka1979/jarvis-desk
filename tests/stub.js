/* window.claude stub written against runtime contract 0.2.98 (sample/db/user/tts/dictation/downloads).
   Injected with addInitScript. Config comes from window.__stubCfg (set by an earlier init script). */
(() => {
  const cfg = window.__stubCfg || {};
  if (cfg.noClaude) return;
  const stub = { calls: [], replies: [], ttsCalls: [], dlCalls: [], dbWrites: [], dbLog: [], ttsState: 'idle', ttsStops: 0 };
  window.__stub = stub;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const deepFreeze = (o) => { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); Object.values(o).forEach(deepFreeze); } return o; };
  const clone = (o) => (o === undefined ? undefined : JSON.parse(JSON.stringify(o)));

  /* ---------- sample ---------- */
  function validateInput(input) {
    if (typeof input === 'string') return input.trim() ? null : 'input empty';
    if (!Array.isArray(input) || !input.length) return 'input not string or turn list';
    for (const t of input) {
      if (!t || (t.role !== 'user' && t.role !== 'assistant')) return 'bad role';
      if (typeof t.content !== 'string' || !t.content) return 'empty content';
    }
    if (input[0].role !== 'user') return 'must start on user';
    if (input[input.length - 1].role !== 'user') return 'must end on user';
    return null;
  }
  function sample(input, opts) {
    opts = opts || {};
    const bytes = new TextEncoder().encode(typeof input === 'string' ? input : input.map((t) => t.content).join('')).length;
    stub.calls.push({ input: clone(input), modelTier: opts.modelTier, cache: opts.cache, bytes });
    const r = stub.replies.length ? stub.replies.shift() : { text: 'はい、承知しました。' };
    return new Promise((resolve, reject) => {
      const bad = validateInput(input);
      if (bad) { setTimeout(() => reject({ code: 'invalid_request', message: bad }), 0); return; }
      if (bytes > 262144) { setTimeout(() => reject({ code: 'prompt_too_large', message: 'too large' }), 0); return; }
      if (opts.signal && opts.signal.aborted) { setTimeout(() => reject({ code: 'cancelled', message: 'aborted' }), 0); return; }
      if (r.error && r.errorAt == null) { setTimeout(() => reject({ code: r.error.code, message: 'stub', reason: r.error.reason }), r.thinkMs == null ? 40 : r.thinkMs); return; }
      const size = r.chunkSize || 14; const chunks = [];
      for (let i = 0; i < r.text.length; i += size) chunks.push(r.text.slice(i, i + size));
      let sent = ''; let done = false; let i = 0;
      const fail = (e) => { if (done) return; done = true; reject(e); };
      if (opts.signal) opts.signal.addEventListener('abort', () => fail(Object.assign({ code: 'cancelled', message: 'aborted' }, sent ? { text: sent } : {})));
      const step = () => {
        if (done) return;
        if (r.errorAt != null && i === r.errorAt) {
          fail(Object.assign({ code: r.error.code, message: 'stub', reason: r.error.reason }, sent && r.error.code !== 'refused' ? { text: sent } : {}));
          return;
        }
        if (i >= chunks.length) { done = true; resolve({ text: sent, truncated: !!r.truncated, modelTierApplied: r.tier || opts.modelTier || 'default' }); return; }
        sent += chunks[i]; const delta = chunks[i]; i++;
        try { if (opts.onText) opts.onText({ text: sent, delta }); } catch (e) { console.error('onText threw', e); }
        setTimeout(step, r.stepMs == null ? 25 : r.stepMs);
      };
      setTimeout(step, r.thinkMs == null ? 40 : r.thinkMs);
    });
  }
  sample.json = () => Promise.reject({ code: 'capability_removed', message: 'stub' });
  sample.limits = () => Promise.resolve({ maxPromptBytes: 262144 });

  /* ---------- db (latency-compensated, frozen snapshots, path grammar) ---------- */
  const LSK = '__stubdb';
  let confirmed = {};
  try { confirmed = JSON.parse(localStorage.getItem(LSK) || '{}'); } catch (e) { confirmed = {}; }
  if (cfg.seed) for (const [k, v] of Object.entries(cfg.seed)) if (!(k in confirmed)) confirmed[k] = v;
  const persist = () => { try { localStorage.setItem(LSK, JSON.stringify(confirmed)); } catch (e) { /* ignore */ } };
  persist();
  const pendingW = new Map(); /* path -> {data|null(delete), n} */
  const docL = new Map(); const colL = new Map();
  const latency = () => (cfg.dbLatency == null ? 30 : cfg.dbLatency);
  const segs = (p) => String(p).split('/');
  const SEG = /^[A-Za-z0-9_\-.~:@+]+$/;
  function check(p, wantEven) {
    const s = segs(p);
    if (!p || s.some((x) => !SEG.test(x) || x === '.' || x === '..')) throw new TypeError('bad path segment: ' + p);
    if ((s.length % 2 === 0) !== wantEven) throw new TypeError('wrong parity (' + s.length + ' segments): ' + p);
  }
  const view = (path) => {
    if (pendingW.has(path)) { const w = pendingW.get(path); return w.data === null ? undefined : w.data; }
    return confirmed[path];
  };
  const docSnap = (path, fromCache) => {
    const d = view(path);
    return deepFreeze({ id: segs(path).pop(), exists: d !== undefined, data: () => (d === undefined ? undefined : deepFreeze(clone(d))), metadata: { fromCache: !!fromCache, hasPendingWrites: pendingW.has(path) } });
  };
  const colPaths = (col) => {
    const depth = segs(col).length + 1; const set = new Set();
    for (const k of Object.keys(confirmed)) if (k.startsWith(col + '/') && segs(k).length === depth) set.add(k);
    for (const [k, w] of pendingW) if (k.startsWith(col + '/') && segs(k).length === depth) { if (w.data === null) set.delete(k); else set.add(k); }
    return [...set].filter((k) => view(k) !== undefined).sort();
  };
  const colSnap = (col, fromCache) => {
    const paths = colPaths(col);
    const docs = paths.map((p) => docSnap(p, fromCache));
    return { docs, size: docs.length, empty: !docs.length, docChanges: () => [], metadata: { fromCache: !!fromCache, hasPendingWrites: paths.some((p) => pendingW.has(p)) } };
  };
  const hung = (path) => (cfg.dbHang || []).some((h) => path === h);
  const failing = (path) => (cfg.dbFailListen || []).some((h) => path === h);
  function notify(path) {
    const col = segs(path).slice(0, -1).join('/');
    for (const l of docL.get(path) || []) if (l.ready) { try { l.next(docSnap(path, false)); } catch (e) { console.error('doc listener threw', e); } }
    for (const l of colL.get(col) || []) if (l.ready) { try { l.next(colSnap(col, false)); } catch (e) { console.error('col listener threw', e); } }
  }
  let wn = 0;
  function write(path, data) {
    stub.dbWrites.push({ path, op: data === null ? 'delete' : 'set', at: Date.now(), bytes: data === null ? 0 : new TextEncoder().encode(JSON.stringify(data)).length });
    if (cfg.dbWriteFail) return sleep(latency()).then(() => Promise.reject({ code: cfg.dbWriteFail, message: 'stub' }));
    if (data !== null) {
      if (typeof data !== 'object' || Array.isArray(data)) return Promise.reject({ code: 'invalid_argument', message: 'body must be an object' });
      if (new TextEncoder().encode(JSON.stringify(data)).length > 262144) return Promise.reject({ code: 'invalid_argument', message: 'document over 256 KiB' });
    }
    const n = ++wn; const body = data === null ? null : clone(data);
    pendingW.set(path, { data: body, n });
    notify(path); /* latency compensation: own write visible at once */
    return sleep(latency()).then(() => {
      if (body === null) delete confirmed[path]; else confirmed[path] = body;
      persist();
      const w = pendingW.get(path); if (w && w.n === n) pendingW.delete(path);
      if (cfg.dbResolveBeforeNotify) { setTimeout(() => notify(path), 0); } else notify(path);
    });
  }
  const getFails = Object.assign({}, cfg.dbGetFailTimes || {});
  stub.gets = [];
  function docRef(path) {
    check(path, true);
    return {
      id: segs(path).pop(), path,
      get: () => {
        stub.gets.push(path);
        if (getFails[path] > 0) { getFails[path]--; return sleep(latency()).then(() => Promise.reject({ code: 'unavailable', message: 'stub' })); }
        return (cfg.dbGetFail && (cfg.dbGetFail === true || cfg.dbGetFail.includes(path))
          ? sleep(latency()).then(() => Promise.reject({ code: 'unavailable', message: 'stub' }))
          : cfg.dbGetDelay && cfg.dbGetDelay[path] != null ? sleep(cfg.dbGetDelay[path]).then(() => docSnap(path, false))
          : sleep(latency()).then(() => docSnap(path, false)));
      },
      set: (data) => write(path, data),
      update: (data) => (view(path) === undefined ? Promise.reject({ code: 'invalid_argument', message: 'missing' }) : write(path, Object.assign({}, view(path), data))),
      delete: () => write(path, null),
      onSnapshot(next, error) {
        const l = { next, ready: false }; if (!docL.has(path)) docL.set(path, new Set()); docL.get(path).add(l);
        stub.dbLog.push('listen doc ' + path);
        /* a copy saved on an earlier visit: delivered first, marked fromCache */
        if (cfg.dbCache && cfg.dbCache[path] !== undefined) {
          const c = cfg.dbCache[path];
          setTimeout(() => next(deepFreeze({ id: segs(path).pop(), exists: c !== null, data: () => (c === null ? undefined : deepFreeze(clone(c))), metadata: { fromCache: true, hasPendingWrites: false } })), 5);
        }
        if (failing(path)) setTimeout(() => { if (error) error({ code: 'revoked', message: 'stub' }); }, latency());
        else if (!hung(path)) setTimeout(() => { l.ready = true; next(docSnap(path, false)); }, cfg.dbFirstDelay == null ? latency() : cfg.dbFirstDelay);
        return () => docL.get(path).delete(l);
      },
      collection: (sub) => colRef(path + '/' + sub),
    };
  }
  function colRef(path) {
    check(path, false);
    return {
      path,
      doc: (id) => docRef(path + '/' + (id || 'auto' + (++wn))),
      get: () => sleep(latency()).then(() => colSnap(path, false)),
      onSnapshot(next, error) {
        const l = { next, ready: false }; if (!colL.has(path)) colL.set(path, new Set()); colL.get(path).add(l);
        stub.dbLog.push('listen col ' + path);
        if (failing(path)) setTimeout(() => { if (error) error({ code: 'revoked', message: 'stub' }); }, latency());
        else if (!hung(path)) setTimeout(() => { l.ready = true; next(colSnap(path, false)); }, cfg.dbFirstDelay == null ? latency() : cfg.dbFirstDelay);
        return () => colL.get(path).delete(l);
      },
    };
  }
  const db = { doc: docRef, collection: colRef };
  stub.dbDump = () => clone(confirmed);
  stub.dbExternalWrite = (path, data) => { if (data === null) delete confirmed[path]; else confirmed[path] = clone(data); persist(); notify(path); };

  /* ---------- user ---------- */
  const user = { id: () => Promise.resolve(cfg.userId === undefined ? 'u_test1' : cfg.userId), isOwner: () => Promise.resolve(true), canEdit: () => Promise.resolve(true), can: () => Promise.resolve(null) };

  /* ---------- tts ---------- */
  const ttsH = new Set(); let ttsRun = null;
  const setTts = (state, reason) => { stub.ttsState = state; for (const h of ttsH) { try { h(reason ? { state, reason } : { state }); } catch (e) { console.error(e); } } };
  const tts = {
    speak(what, options) {
      stub.ttsCalls.push({ what: clone(what), options: clone(options) });
      if (cfg.ttsReject) return Promise.reject({ code: cfg.ttsReject, message: 'stub' });
      if (ttsRun) { const old = ttsRun; ttsRun = null; clearTimeout(old.t1); clearTimeout(old.t2); old.reject({ code: 'stopped', reason: 'replaced', message: 'stub' }); }
      return new Promise((resolve, reject) => {
        const run = { reject };
        ttsRun = run; setTts('starting');
        run.t1 = setTimeout(() => { if (ttsRun === run) setTts('speaking'); }, 30);
        run.t2 = setTimeout(() => { if (ttsRun === run) { ttsRun = null; setTts('idle', 'completed'); resolve({ playedMs: cfg.ttsMs || 600 }); } }, cfg.ttsMs || 600);
      });
    },
    add(what, options) { return tts.speak(what, options); },
    stop() { stub.ttsStops++; if (ttsRun) { const old = ttsRun; ttsRun = null; clearTimeout(old.t1); clearTimeout(old.t2); setTts('idle', 'stopped'); old.reject({ code: 'stopped', reason: 'stopped', message: 'stub' }); } return Promise.resolve(); },
    pause: () => Promise.resolve(), resume: () => Promise.resolve(), setRate: () => Promise.resolve(),
    active: () => stub.ttsState !== 'idle',
    voices: () => Promise.resolve(['buttery', 'airy', 'glassy', 'rounded']),
    languages: () => Promise.resolve(['en', 'ja']),
    onState(h) { ttsH.add(h); return () => ttsH.delete(h); },
    onLine: () => () => {}, onPosition: () => () => {},
  };
  stub.ttsEnd = (reason) => { if (ttsRun) { const o = ttsRun; ttsRun = null; clearTimeout(o.t1); clearTimeout(o.t2); o.reject({ code: reason === 'not_granted' ? 'not_granted' : 'stopped', reason, message: 'stub' }); } setTts('idle', reason); };

  /* ---------- dictation ---------- */
  const dH = { partial: new Set(), final: new Set(), state: new Set() }; let dState = 'idle';
  const setD = (state, reason) => { dState = state; for (const h of dH.state) h(reason ? { state, reason } : { state }); };
  const dictation = {
    start() { if (cfg.dictReject) return Promise.reject({ code: cfg.dictReject, message: 'stub' }); setD('starting'); return sleep(20).then(() => { setD('listening'); }); },
    stop() { if (dState === 'idle') return Promise.resolve(); setD('finishing'); return sleep(20).then(() => { setD('idle', 'stopped'); }); },
    active: () => dState !== 'idle',
    onPartial(h) { dH.partial.add(h); return () => dH.partial.delete(h); },
    onFinal(h) { dH.final.add(h); return () => dH.final.delete(h); },
    onState(h) { dH.state.add(h); return () => dH.state.delete(h); },
  };
  stub.dictSay = (partial, final) => { if (partial != null) for (const h of dH.partial) h({ text: partial }); if (final != null) { for (const h of dH.partial) h({ text: '' }); for (const h of dH.final) h({ text: final }); } };
  stub.dictEnd = (reason) => setD('idle', reason);

  /* ---------- downloads ---------- */
  const downloads = { save(req) { stub.dlCalls.push({ filename: req.filename, len: String(req.data).length, head: String(req.data).slice(0, 80) }); return cfg.dlReject ? Promise.reject({ code: cfg.dlReject, message: 'stub' }) : Promise.resolve({ status: 'saved' }); } };

  const all = { sample, db, user, tts: Object.freeze(tts), dictation: Object.freeze(dictation), downloads: Object.freeze(downloads) };
  const absent = new Set(cfg.absent || []);
  const memo = new Map();
  window.claude = {
    use(name) {
      if (!memo.has(name)) memo.set(name, sleep(cfg.useDelay == null ? 15 : (cfg.useDelayBy && cfg.useDelayBy[name] != null ? cfg.useDelayBy[name] : cfg.useDelay)).then(() => (absent.has(name) || !(name in all) ? null : all[name])));
      return memo.get(name);
    },
  };
})();
