/* GenPlayer UI icons: local 3D objects + filled multicolour miniature controls. */
(function (global) {
  'use strict';
  const shapes = global.GPFilledIcons;

  // Exact tokens only. The host chooses which UI labels to replace; player text stays untouched.
  const emojiMap = Object.freeze({
    '⚽': 'football', '👥': 'users', '👤': 'user', '🏆': 'trophy', '📊': 'chart',
    '💰': 'wallet', '💳': 'wallet', '📈': 'trend-up', '📉': 'trend-down', '💵': 'coins',
    '📅': 'calendar', '🗓️': 'calendar', '🕒': 'clock', '⏱️': 'timer', '⏳': 'timer',
    '✨': 'sparkles', '🤖': 'sparkles', '🔀': 'shuffle', '➕': 'plus', '➖': 'minus',
    '←': 'arrow-left', '→': 'arrow-right', '🔙': 'arrow-left', '×': 'close',
    '✅': 'check-circle', '✔️': 'check', '❌': 'close', '✏️': 'edit', '📝': 'edit',
    '🗑️': 'trash', '💾': 'save', '🕘': 'history', '🔒': 'lock', '🔓': 'unlock',
    '👁️': 'eye', '✉️': 'mail', '📧': 'mail', '⚙️': 'settings', '🔍': 'search',
    '📤': 'upload', '📥': 'download', '🔄': 'refresh', '💬': 'message', '🚩': 'flag',
    '🛡️': 'shield', '🎯': 'target', '⚡': 'bolt', '❤️': 'heart', 'ℹ️': 'info',
    '❓': 'help', '⚠️': 'alert', '🌙': 'moon', '☀️': 'sun', '⭐': 'star',
    '🏅': 'award', '🥇': 'medal-gold', '🥈': 'medal-silver', '🥉': 'medal-bronze', '📋': 'clipboard', '🔥': 'flame', '🧊': 'snowflake',
    '❄️': 'snowflake', '🛠️': 'tool', '🧪': 'flask', '🏠': 'home', '📍': 'map-pin',
    '🗂️': 'backup', '📁': 'backup', '📂': 'backup', '⚖️': 'scales',
    '🧤': 'glove', '👟': 'boot', '🤝': 'handshake', '👑': 'crown', '🏹': 'chart'
  });

  // Illustration identity is explicit, not inferred from a generic emoji.
  // A squad illustration must never replace the people rating a player; a calendar
  // must not turn a clipboard/backup/history action into a match schedule.
  const aliases = Object.freeze({
    squad: 'users', ranking: 'trophy', 'match-history': 'calendar',
    'player-form': 'activity', finance: 'wallet', scorer: 'football', goal: 'football',
    'match-score': 'clipboard', 'goal-record': 'football', 'player-rating': 'clipboard',
    'match-analysis': 'scales', 'finance-ledger': 'wallet', 'activity-log': 'history'
  });
  const images = Object.freeze({
    football: 'assets/ui/football-3d-v1.webp',
    goal: 'assets/ui/football-3d-v1.webp',
    scorer: 'assets/ui/football-3d-v1.webp',
    trophy: 'assets/ui/ranking-3d-v1.webp',
    lineup: 'assets/ui/lineup-3d-v2.webp',
    squad: 'assets/ui/players-3d-v1.webp',
    ranking: 'assets/ui/ranking-3d-v1.webp',
    'match-history': 'assets/ui/history-3d-v1.webp',
    'player-form': 'assets/ui/player-form-3d-v2.webp',
    finance: 'assets/ui/finance-3d-v1.webp',
    backup: 'assets/ui/backup-3d-v2.webp',
    'match-score': 'assets/ui/match-score-3d-v1.webp',
    'goal-record': 'assets/ui/goal-record-3d-v1.webp',
    'player-rating': 'assets/ui/player-rating-3d-v1.webp',
    'match-analysis': 'assets/ui/match-analysis-3d-v1.webp',
    'finance-ledger': 'assets/ui/finance-ledger-3d-v1.webp',
    'activity-log': 'assets/ui/activity-log-3d-v1.webp'
  });

  function escapeAttribute(value) {
    return String(value).replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
  }

  function render(name, extraClass = '') {
    const key = Object.prototype.hasOwnProperty.call(shapes, name) ||
      Object.prototype.hasOwnProperty.call(aliases, name) ? name : 'info';
    const classes = 'ui-icon' + (extraClass ? ' ' + String(extraClass) : '');
    if (images[key]) {
      return '<img class="' + escapeAttribute(classes) + ' ui-icon-image" data-icon="' +
        escapeAttribute(key) + '" src="' + images[key] +
        '" width="24" height="24" alt="" aria-hidden="true" decoding="async">';
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" class="' + escapeAttribute(classes) +
      ' ui-icon-solid" data-icon="' + escapeAttribute(key) +
      '" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="none"' +
      ' stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"' +
      ' aria-hidden="true" focusable="false">' +
      shapes[aliases[key] || key] + '</svg>';
  }

  global.GPIcons = Object.freeze({ render, names: Object.freeze([...Object.keys(shapes), ...Object.keys(aliases)]), emojiMap, images });
})(window);
