/* すべてのテストを順に実行する。1つでも失敗があれば終了コード1で終わる。 */
const { spawnSync } = require('child_process');
const path = require('path');
const suites = ['01-core', '02-store', '03-ui', '04-extra', '05-valve'];
let pass = 0; let fail = 0; const bad = [];
for (const s of suites) {
  console.log('\n===== ' + s + ' =====');
  const r = spawnSync(process.execPath, [path.join(__dirname, s + '.cjs')], { encoding: 'utf8', timeout: 15 * 60 * 1000 });
  const out = (r.stdout || '') + (r.stderr || '');
  const quiet = out.split('\n').filter((l) => /^## |FAIL|^pass=|^failed/.test(l)).join('\n');
  console.log(process.env.VERBOSE ? out : quiet);
  const m = out.match(/pass=(\d+) fail=(\d+)/);
  if (m) { pass += +m[1]; fail += +m[2]; }
  if (!m || +m[2] > 0 || r.status !== 0) bad.push(s);
}
console.log('\n===== 合計 pass=' + pass + ' fail=' + fail + (bad.length ? '  失敗したまとまり: ' + bad.join(', ') : '') + ' =====');
process.exit(bad.length ? 1 : 0);
