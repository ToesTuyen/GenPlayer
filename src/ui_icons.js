/* GenPlayer UI icons: local color illustrations + SVG controls, no third-party library. */
(function (global) {
  'use strict';
  const shapes = Object.freeze({
    football: '<circle cx="12" cy="12" r="9"/><path d="m12 7 4.8 3.5-1.8 5.6H9l-1.8-5.6L12 7Zm0-4v4m-8.5 2.3 3.7 1.2m9.6 0 3.7-1.2M6.7 19.3 9 16.1m6 0 2.3 3.2"/>',
    users: '<path d="M3 21v-2a5 5 0 0 1 5-5h3a5 5 0 0 1 5 5v2m2-7a5 5 0 0 1 3 4.6V21M16 3.2a4 4 0 0 1 0 7.6"/><circle cx="9.5" cy="7" r="4"/>',
    user: '<circle cx="12" cy="7" r="4"/><path d="M4 21v-2a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v2"/>',
    trophy: '<path d="M8 3h8v5a4 4 0 0 1-8 0V3Zm0 2H4v2a4 4 0 0 0 4 4m8-6h4v2a4 4 0 0 1-4 4m-4 1v5m-4 4h8m-8 0v-2a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    chart: '<path d="M4 3v17a1 1 0 0 0 1 1h16M8 16v-4m5 4V7m5 9V4"/>',
    wallet: '<path d="M20 8V6a2 2 0 0 0-2-2H6a3 3 0 0 0 0 6h14v10H6a3 3 0 0 1-3-3V7m17 6h-4a2 2 0 0 0 0 4h4"/><circle cx="16" cy="15" r=".5" fill="currentColor" stroke="none"/>',
    activity: '<path d="M2 12h4l3-8 6 16 3-8h4"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 10h18m-14 4h3m4 0h3m-10 3h3"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    sparkles: '<path d="m12 3 2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4L12 3ZM4 3v4M2 5h4m14 12v4m-2-2h4"/>',
    shuffle: '<path d="M3 6h2c5 0 9 12 14 12h2m-4-4 4 4-4 4M3 18h2c2 0 4-2.4 6-5.2M14 8.8c1.7-1.8 3.3-2.8 5-2.8h2m-4-4 4 4-4 4"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    'arrow-left': '<path d="m11 5-7 7 7 7M4 12h16"/>',
    'arrow-right': '<path d="m13 5 7 7-7 7M4 12h16"/>',
    'chevron-down': '<path d="m6 9 6 6 6-6"/>',
    'chevron-left': '<path d="m15 6-6 6 6 6"/>',
    'chevron-right': '<path d="m9 6 6 6-6 6"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    'check-circle': '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
    edit: '<path d="m14.5 5.5 4 4M4 20l4.5-1L20 7.5a2.8 2.8 0 0 0-4-4L4.5 15 4 20Z"/>',
    trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 14a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1l1-14M10 10v7m4-7v7"/>',
    save: '<path d="M5 3h12l4 4v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm2 0v6h9V3M7 21v-7h10v7"/>',
    history: '<path d="M3 10a9 9 0 1 1 .9 6M3 4v6h6m3-3v5l3 2"/>',
    login: '<path d="M14 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5M3 12h12m-4-4 4 4-4 4"/>',
    logout: '<path d="M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h5m-1-9h12m-4-4 4 4-4 4"/>',
    lock: '<rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 4v3"/>',
    unlock: '<rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 7.7-1.5M12 14v3"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    'eye-off': '<path d="m3 3 18 18M10.6 5.1C11.1 5 11.5 5 12 5c6.5 0 10 7 10 7a19 19 0 0 1-3 3.8M6.1 6.2A19 19 0 0 0 2 12s3.5 7 10 7c1.7 0 3.2-.5 4.5-1.2M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m4 7 8 6 8-6"/>',
    settings: '<path d="m10 3-.6 2.6-2.3 1.3-2.5-.8-2 3.5L4.5 12l-1.9 2.4 2 3.5 2.5-.8 2.3 1.3L10 21h4l.6-2.6 2.3-1.3 2.5.8 2-3.5-1.9-2.4 1.9-2.4-2-3.5-2.5.8-2.3-1.3L14 3H10Z"/><circle cx="12" cy="12" r="3"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
    filter: '<path d="M3 4h18l-7 8v7l-4 2v-9L3 4Z"/>',
    upload: '<path d="M12 16V3m-5 5 5-5 5 5M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/>',
    download: '<path d="M12 3v13m-5-5 5 5 5-5M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/>',
    refresh: '<path d="M20 8a8.5 8.5 0 0 0-14.7-2L3 9m0-5v5h5m-4 7a8.5 8.5 0 0 0 14.7 2l2.3-3m0 5v-5h-5"/>',
    message: '<path d="M21 14a3 3 0 0 1-3 3H8l-5 4V6a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v8ZM7 8h10M7 12h6"/>',
    flag: '<path d="M4 21V3m0 0c6-3 10 3 16 0v11c-6 3-10-3-16 0"/>',
    shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/>',
    bolt: '<path d="m13 2-9 12h7l-1 8 10-12h-7l1-8Z"/>',
    heart: '<path d="M20.6 4.7a5.2 5.2 0 0 0-7.4 0L12 6l-1.2-1.3a5.2 5.2 0 0 0-7.4 7.4L12 21l8.6-8.9a5.2 5.2 0 0 0 0-7.4Z"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6"/><circle cx="12" cy="7.5" r=".7" fill="currentColor" stroke="none"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 0 1 6 0c0 2-3 2-3 5"/><circle cx="12" cy="17" r=".7" fill="currentColor" stroke="none"/>',
    alert: '<path d="m10.3 4-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3l-8-14a2 2 0 0 0-3.4 0ZM12 9v4"/><circle cx="12" cy="17" r=".7" fill="currentColor" stroke="none"/>',
    moon: '<path d="M20.5 13.2A9 9 0 0 1 10.8 3.5a9 9 0 1 0 9.7 9.7Z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    star: '<path d="m12 3 2.8 5.7 6.3.9-4.5 4.4 1.1 6.2-5.7-3-5.7 3 1.1-6.2L3.9 9.6l6.3-.9L12 3Z"/>',
    award: '<circle cx="12" cy="8" r="5"/><path d="m8 11-2 10 6-3 6 3-2-10"/>',
    clipboard: '<rect x="8" y="3" width="8" height="4" rx="1.5"/><path d="M8 5H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M8 12h8m-8 4h5"/>',
    coins: '<ellipse cx="9" cy="6" rx="6" ry="3"/><path d="M3 6v4c0 1.7 2.7 3 6 3s6-1.3 6-3V6M3 10v4c0 1.7 2.7 3 6 3m6-8c3.3 0 6 1.3 6 3s-2.7 3-6 3c-1.5 0-2.9-.3-4-.7M9 14v4c0 1.7 2.7 3 6 3s6-1.3 6-3v-6"/>',
    'trend-up': '<path d="m3 17 6-6 4 4 8-10m-6 0h6v6"/>',
    'trend-down': '<path d="m3 7 6 6 4-4 8 10m-6 0h6v-6"/>',
    flame: '<path d="M12 3c1 5-3 6-3 10a3 3 0 0 0 6 0c0-1-.4-2-1-3 3 1 5 4 5 7a7 7 0 0 1-14 0c0-5 5-8 7-14Z"/>',
    snowflake: '<path d="M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7M9 4l3 3 3-3m-6 16 3-3 3 3M3.5 10.5l4.1-1.1-1.1-4.1m11 13.4-1.1-4.1 4.1-1.1M6.5 18.7l1.1-4.1-4.1-1.1m17-3-4.1-1.1 1.1-4.1"/>',
    timer: '<circle cx="12" cy="14" r="7"/><path d="M9 3h6m-3 0v4m0 4v3l2 2m4-9 2-2"/>',
    tool: '<path d="M14.5 6.5 18 3a6 6 0 0 0-7.5 7.5L3.8 17.2a2.1 2.1 0 0 0 3 3l6.7-6.7A6 6 0 0 0 21 6l-3.5 3.5-3-3Z"/>',
    flask: '<path d="M9 3h6m-5 0v7L4.5 19a1.3 1.3 0 0 0 1.1 2h12.8a1.3 1.3 0 0 0 1.1-2L14 10V3M7 15h10"/>',
    home: '<path d="m3 10 9-7 9 7M5 8.5V21h5v-7h4v7h5V8.5"/>',
    more: '<circle cx="5" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="19" cy="12" r="1" fill="currentColor"/>',
    minus: '<path d="M5 12h14"/>',
    map: '<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Zm6-3v15m6-12v15"/>',
    'map-pin': '<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 0 1 14 0Z"/><circle cx="12" cy="10" r="2.5"/>'
  });

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
    '🏅': 'award', '🥇': 'award', '📋': 'clipboard', '🔥': 'flame', '🧊': 'snowflake',
    '❄️': 'snowflake', '🛠️': 'tool', '🧪': 'flask', '🏠': 'home', '📍': 'map-pin'
  });

  // AI-created color illustrations for primary navigation and section identity.
  // Compact interaction controls keep simple SVGs so their small shapes stay clear.
  const images = Object.freeze({
    shuffle: 'assets/ui/team-3d-v1.webp',
    users: 'assets/ui/players-3d-v1.webp',
    trophy: 'assets/ui/ranking-3d-v1.webp',
    award: 'assets/ui/ranking-3d-v1.webp',
    calendar: 'assets/ui/history-3d-v1.webp',
    history: 'assets/ui/history-3d-v1.webp',
    clipboard: 'assets/ui/history-3d-v1.webp',
    activity: 'assets/ui/form-3d-v1.webp',
    chart: 'assets/ui/form-3d-v1.webp',
    wallet: 'assets/ui/finance-3d-v1.webp',
    coins: 'assets/ui/finance-3d-v1.webp'
  });

  function escapeAttribute(value) {
    return String(value).replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
  }

  function render(name, extraClass = '') {
    const key = Object.prototype.hasOwnProperty.call(shapes, name) ? name : 'info';
    const classes = 'ui-icon' + (extraClass ? ' ' + String(extraClass) : '');
    if (images[key]) {
      return '<img class="' + escapeAttribute(classes) + ' ui-icon-image" data-icon="' +
        escapeAttribute(key) + '" src="' + images[key] +
        '" width="24" height="24" alt="" aria-hidden="true" decoding="async">';
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" class="' + escapeAttribute(classes) +
      '" data-icon="' + escapeAttribute(key) +
      '" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor"' +
      ' stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"' +
      ' aria-hidden="true" focusable="false">' + shapes[key] + '</svg>';
  }

  global.GPIcons = Object.freeze({ render, names: Object.freeze(Object.keys(shapes)), emojiMap, images });
})(window);
