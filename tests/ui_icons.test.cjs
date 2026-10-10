// Read-only, dependency-free regression checks for icon meaning and local assets.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const context = {window: {}};
vm.runInNewContext(fs.readFileSync(path.join(root, 'src/ui_icons_solid.js'), 'utf8'), context);
vm.runInNewContext(fs.readFileSync(path.join(root, 'src/ui_icons.js'), 'utf8'), context);
const icons = context.window.GPIcons;

assert.equal(new Set(icons.names).size, icons.names.length);
for (const [name, asset] of Object.entries(icons.images)) {
  assert.ok(icons.render(name).startsWith('<img'), name);
  assert.ok(fs.existsSync(path.join(root, asset)), asset);
  assert.ok(fs.existsSync(path.join(root, asset.replace(/\.webp$/, '.png'))), asset + ' original');
}
// These small icons describe statistics or people/actions, not navigation pages.
for (const name of ['users', 'award', 'history', 'clipboard', 'chart', 'activity',
  'scales', 'glove', 'boot', 'coins', 'wallet', 'shuffle']) {
  assert.ok(icons.render(name).startsWith('<svg'), name + ' must not reuse a menu image');
}
const medals = ['medal-gold', 'medal-silver', 'medal-bronze'].map(name => icons.render(name));
assert.equal(new Set(medals).size, 3, 'medal ranks remain distinct');
assert.ok(icons.render('missing-icon').includes('data-icon="info"'));
assert.ok(icons.render('goal', 'test" onclick="bad').includes('&quot;'));
assert.notEqual(icons.render('income'), icons.render('expense'), 'income and expense arrows are distinct');
assert.ok(icons.render('boot').includes('ui-icon-solid'), 'small icons are filled mini-illustrations');
for (const name of icons.names) {
  const markup=icons.render(name);
  if(!icons.images[name]) {
    assert.ok(markup.includes('ui-icon-solid')&&!markup.includes('undefined'), 'filled mini-icon: '+name);
    assert.ok(!markup.includes('stroke="currentColor"')&&!markup.includes('fill-opacity=".16"'), 'not an old outline with a colour wash: '+name);
    assert.ok(new Set([...markup.matchAll(/(?:fill|stroke)="(#[a-f\d]{6})"/gi)].map(x=>x[1])).size>=2, 'multiple explicit colours: '+name);
  }
}
assert.equal(icons.images.goal, icons.images.football, 'goal counters use a standalone football, not a goal-net/menu illustration');
assert.equal(icons.images.scorer, icons.images.football);
assert.equal(icons.images.trophy, icons.images.ranking, 'achievement cups match the illustrated ranking cup');

const template = fs.readFileSync(path.join(root, 'src/web_template.html'), 'utf8');
const menuIcons = Array.from(template.matchAll(/class="ap-icon" data-ui-icon="([^"]+)"/g), x => x[1]);
assert.deepEqual(menuIcons, ['lineup', 'squad', 'ranking', 'match-history', 'player-form', 'finance', 'backup']);
assert.ok(template.includes('class="rank-goals">${GPIcons.render("goal")}'));
assert.ok(!template.includes('class="pm-arch-name">🏅'), 'position badges should use position icons');
for (const name of ['match-score', 'goal-record', 'player-rating', 'match-analysis', 'finance-ledger', 'activity-log']) {
  assert.ok(icons.images[name], 'inner screen illustration: ' + name);
  assert.ok(template.includes('GPIcons.render("' + name + '")') || template.includes('data-ui-icon="' + name + '"'), 'inner screen usage: ' + name);
}
assert.ok(template.includes('$("mm-title").innerHTML=GPIcons.render("lineup")'), 'dynamic match title retains its illustration');
assert.ok(template.includes('$("finance-modal-title").innerHTML=GPIcons.render("finance-ledger")'), 'dynamic finance title retains its illustration');
assert.ok(!template.includes('textContent="🗂️ Xem thẻ"'), 'player card action is not a backup icon');
for (const match of template.matchAll(/data-ui-icon="([^"]+)"/g)) {
  assert.ok(icons.names.includes(match[1]), 'unknown semantic icon: ' + match[1]);
}
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'assets/ui/generation.json'), 'utf8'));
for (const asset of manifest.assets) assert.ok(fs.existsSync(path.join(root, 'assets/ui', asset.path)), asset.path);
console.log('Icon context, distinct medals, templates and local image assets: OK');
