// Read-only, dependency-free regression checks for icon meaning and local assets.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const context = {window: {}};
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
  'goal', 'scorer', 'scales', 'glove', 'boot', 'coins', 'wallet', 'shuffle']) {
  assert.ok(icons.render(name).startsWith('<svg'), name + ' must not reuse a menu image');
}
const medals = ['medal-gold', 'medal-silver', 'medal-bronze'].map(name => icons.render(name));
assert.equal(new Set(medals).size, 3, 'medal ranks remain distinct');
assert.ok(icons.render('missing-icon').includes('data-icon="info"'));
assert.ok(icons.render('goal', 'test" onclick="bad').includes('&quot;'));

const template = fs.readFileSync(path.join(root, 'src/web_template.html'), 'utf8');
const menuIcons = Array.from(template.matchAll(/class="ap-icon" data-ui-icon="([^"]+)"/g), x => x[1]);
assert.deepEqual(menuIcons, ['lineup', 'squad', 'ranking', 'match-history', 'player-form', 'finance', 'backup']);
assert.ok(template.includes('class="rank-goals">${GPIcons.render("goal")}'));
assert.ok(!template.includes('class="pm-arch-name">🏅'), 'position badges should use position icons');
for (const match of template.matchAll(/data-ui-icon="([^"]+)"/g)) {
  assert.ok(icons.names.includes(match[1]), 'unknown semantic icon: ' + match[1]);
}
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'assets/ui/generation.json'), 'utf8'));
for (const asset of manifest.assets) assert.ok(fs.existsSync(path.join(root, 'assets/ui', asset.path)), asset.path);
console.log('Icon context, distinct medals, templates and local image assets: OK');
