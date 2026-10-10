/* Filled miniature illustrations for controls and small statistics. */
(function (global) {
  'use strict';
  const p = Object.freeze({violet:'#aa8cda',purple:'#7d6cb6',blue:'#709fd8',navy:'#405479',sky:'#c3dbf5',paper:'#f8faff',mint:'#78c8ac',green:'#4a9c80',pink:'#e69aa6',red:'#c97587',gold:'#edbe62',ochre:'#ba8b3f',teal:'#76babc',slate:'#93a6bd'});
  const fill = (d,color) => '<path d="'+d+'" fill="'+color+'"/>';
  const line = (d,color=p.paper,width=1.7) => '<path d="'+d+'" fill="none" stroke="'+color+'" stroke-width="'+width+'" stroke-linecap="round" stroke-linejoin="round"/>';
  const dot = (x,y,r,color) => '<circle cx="'+x+'" cy="'+y+'" r="'+r+'" fill="'+color+'"/>';
  const rect = (x,y,w,h,color,r=2) => '<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" rx="'+r+'" fill="'+color+'"/>';
  const clock = dot(12,12,10,p.blue)+dot(12,12,7.7,p.paper)+line('M12 6v6l4 3',p.navy,2)+dot(12,12,1.2,p.gold);
  const eye = fill('M1 12C7 1 17 1 23 12 17 23 7 23 1 12Z',p.sky)+dot(12,12,5,p.blue)+dot(12,12,2.5,p.navy)+dot(10.8,10.5,1.2,p.paper);
  const heart = 'M12 22 2 12C-4 5 6-3 12 5 18-3 28 5 22 12Z';
  const tray = color => rect(2,15,20,8,color)+line('M5 19h3l2 2h4l2-2h3',p.paper,1.4);
  const arrowIn = 'M9 1h6v8h5l-8 9-8-9h5Z', arrowOut = 'm12 1 8 9h-5v8H9v-8H4Z';
  const ribbon = color => fill('m5 1 4 9h6l4-9h-5l-2 5-2-5Z',color);
  const medal = (ribbonColor,edge,face) => ribbon(ribbonColor)+dot(12,16,7,edge)+dot(12,15,6,face)+fill('m12 11 1.3 2.5 2.7.5-2 2 .5 3-2.5-1.4-2.5 1.4.5-3-2-2 2.7-.5Z',p.paper);
  global.GPFilledIcons = Object.freeze({
    football: dot(12,12,10,p.paper)+fill('m12 6 5 4-2 6H9l-2-6Zm-8-1 4-2 1 4-4 3Zm16 0-4-2-1 4 4 3ZM5 18l4-2 2 5-4-1Zm14 0-4-2-2 5 4-1Z',p.navy),
    trophy: fill('M7 4H2v5c0 4 4 6 7 5V6Zm10 0h5v5c0 4-4 6-7 5V6Z',p.ochre)+fill('M7 2h10v8a5 5 0 0 1-10 0Z',p.gold)+rect(11,14,2,5,p.ochre,0)+rect(6,19,12,4,p.purple,1)+line('M10 5v5'),
    users: dot(6,8,3,p.gold)+dot(18,8,3,p.mint)+fill('M1 21v-4c0-5 10-5 10 0v4Zm12 0v-4c0-5 10-5 10 0v4Z',p.blue)+dot(12,6,4,p.sky)+fill('M5 22v-5c0-7 14-7 14 0v5Z',p.violet)+line('M9 17h6'),
    user: dot(12,7,4,p.gold)+fill('M4 22v-4a8 8 0 0 1 16 0v4Z',p.violet)+rect(4,19,16,3,p.purple,0)+line('M9 17h6'),
    chart: rect(3,12,5,9,p.blue)+rect(10,7,5,14,p.violet)+rect(17,3,5,18,p.mint)+line('M2 22h21',p.navy,2),
    wallet: fill('M3 5c0-2 2-3 4-3h13v6H3Z',p.purple)+rect(2,6,20,16,p.violet,4)+fill('M15 11h7v7h-7a3.5 3.5 0 0 1 0-7Z',p.blue)+dot(17,14.5,1.2,p.gold)+line('M6 9h7',p.sky),
    activity: rect(2,4,20,16,p.blue,4)+line('M4 12h4l2-5 4 10 2-5h4',p.paper,2.1),
    calendar: rect(2,4,20,18,p.sky,3)+fill('M2 7a3 3 0 0 1 3-3h14a3 3 0 0 1 3 3v3H2Z',p.violet)+line('M7 2v5m10-5v5',p.purple,2.4)+rect(6,13,4,3,p.blue,1)+rect(14,13,4,3,p.pink,1)+line('M7 19h3m4 0h3',p.blue,1.4),
    clock,
    sparkles: fill('m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z',p.violet)+fill('m12 6 1.8 4.2L18 12l-4.2 1.8L12 18l-1.8-4.2L6 12l4.2-1.8Z',p.sky)+dot(3,3,1.5,p.gold)+dot(21,21,1.5,p.mint),
    shuffle: line('M3 6h2c5 0 9 12 14 12h2',p.blue,3)+line('M3 18h2c2 0 4-2.4 6-5.2M14 8.8c1.7-1.8 3.3-2.8 5-2.8h2',p.violet,3)+fill('m17 2 6 4-6 4Zm0 12 6 4-6 4Z',p.violet),
    plus: fill('M9 3h6v6h6v6h-6v6H9v-6H3V9h6Z',p.mint)+line('M11 5v6H5',p.paper,1.4),
    minus: rect(2,9,20,6,p.pink)+line('M5 11h14',p.paper,1.2),
    'arrow-left': fill('m11 3-10 9 10 9v-6h12V9H11Z',p.blue)+line('M5 11l5-4m2 4h8',p.sky,1.4),
    'arrow-right': fill('m13 3 10 9-10 9v-6H1V9h12Z',p.blue)+line('M4 11h10l3-3',p.sky,1.4),
    income: tray(p.green)+fill(arrowIn,p.mint),
    expense: tray(p.red)+fill(arrowOut,p.pink),
    'chevron-down': fill('m2 7 3-3 7 7 7-7 3 3-10 11Z',p.blue)+line('M6 7l6 6 6-6',p.sky,1.2),
    'chevron-left': fill('m17 2 3 3-7 7 7 7-3 3L7 12Z',p.blue)+line('M17 6l-6 6 6 6',p.sky,1.2),
    'chevron-right': fill('m7 2-3 3 7 7-7 7 3 3 10-10Z',p.blue)+line('M7 6l6 6-6 6',p.sky,1.2),
    close: fill('m5 2 7 7 7-7 3 3-7 7 7 7-3 3-7-7-7 7-3-3 7-7-7-7Z',p.pink)+line('M6 5l6 6 6-6',p.paper,1.2),
    check: fill('m1 12 4-4 5 5L20 2l4 4-14 16Z',p.mint)+line('M5 11l5 5L20 5',p.paper,1.3),
    'check-circle': dot(12,12,11,p.mint)+dot(12,12,8.6,p.green)+line('M6 12l4 4 8-9',p.paper,2.6),
    edit: fill('m4 16 12-12 5 5L9 21H3Z',p.gold)+fill('m16 4 2-2c1-1 2-1 3 0l2 2c1 1 1 2 0 3l-2 2Z',p.pink)+fill('m4 16 5 5-6 1Z',p.sky)+fill('m3 20 2 2-3 1Z',p.navy)+line('M7 16l10-10',p.paper,1.1),
    trash: fill('M5 7h14l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2Z',p.pink)+rect(2,4,20,4,p.red,1.5)+rect(8,1,8,3,p.red,1)+line('M9 11v8m6-8v8',p.paper,1.6),
    save: fill('M3 2h15l4 4v14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V3Z',p.blue)+rect(7,2,10,7,p.navy,0)+rect(13,3,3,5,p.gold,0)+rect(6,13,12,9,p.paper,1)+line('M9 16h6m-6 3h6',p.sky,1.4),
    history: dot(12,12,9,p.sky)+line('M3 10a9 9 0 1 1 1 6',p.blue,2.8)+fill('M1 3v9h9Z',p.violet)+line('M12 7v5l3 2',p.navy,2),
    login: rect(12,2,10,20,p.blue)+fill('m16 4 6-2v20l-6-2Z',p.navy)+dot(19,12,1,p.gold)+fill('M1 9h7V5l8 7-8 7v-4H1Z',p.mint),
    logout: rect(2,2,10,20,p.blue)+fill('m6 4-4-2v20l4-2Z',p.navy)+dot(9,12,1,p.gold)+fill('M8 9h7V5l8 7-8 7v-4H8Z',p.pink),
    lock: line('M7 11V7a5 5 0 0 1 10 0v4',p.ochre,3)+rect(3,9,18,14,p.gold,3)+dot(12,15,2,p.navy)+rect(11,15,2,5,p.navy,0)+line('M6 12h4',p.paper,1.3),
    unlock: line('M7 11V7a5 5 0 0 1 9-3',p.ochre,3)+rect(3,9,18,14,p.gold,3)+dot(12,15,2,p.navy)+rect(11,15,2,5,p.navy,0)+line('M6 12h4',p.paper,1.3),
    eye,
    'eye-off': eye+line('M3 3l18 18',p.pink,3),
    mail: rect(2,4,20,16,p.blue,3)+fill('m3 5 9 8 9-8Z',p.sky)+line('M3 19l6-6m12 6-6-6',p.paper,1.4),
    settings: fill('m10 2-.7 3-2.6 1.5-2.9-.9-2.2 3.9L3.8 12l-2.2 2.5 2.2 3.9 2.9-.9L9.3 19l.7 3h4l.7-3 2.6-1.5 2.9.9 2.2-3.9-2.2-2.5 2.2-2.5-2.2-3.9-2.9.9L14.7 5 14 2Z',p.violet)+dot(12,12,5,p.purple)+dot(12,12,2.8,p.paper),
    search: line('M16 16l6 6',p.violet,4)+dot(10,10,8,p.blue)+dot(10,10,5.4,p.sky)+line('M7 7l-1 2',p.paper,1.8),
    filter: fill('M1 3h22L15 13v7l-6 3V13Z',p.blue)+fill('M1 3h22l-3 4H4Z',p.sky)+fill('M9 13h6v7l-6 3Z',p.violet),
    upload: tray(p.violet)+fill(arrowOut,p.blue),
    download: tray(p.violet)+fill(arrowIn,p.blue),
    refresh: line('M20 8a8.5 8.5 0 0 0-14-3M4 16a8.5 8.5 0 0 0 14 3',p.teal,3.4)+fill('M3 1v9h9ZM21 23v-9h-9Z',p.blue),
    message: fill('M2 3h20v14H10l-7 6v-6H2Z',p.violet)+rect(2,3,20,3,p.purple,0)+line('M6 9h12m-12 4h8',p.paper,2),
    flag: fill('M5 3c6-4 10 4 17 0v12c-7 4-11-4-17 0Z',p.pink)+line('M4 2v21',p.navy,2.4)+line('M8 6c4-1 6 2 10 1',p.paper,1.3),
    shield: fill('m12 1 10 4v7c0 6-10 11-10 11S2 18 2 12V5Z',p.blue)+fill('m12 4 7 3v5c0 4-7 8-7 8Z',p.sky)+line('M6 7v5c0 2 1 3 2 4',p.paper,1.3),
    target: dot(12,12,11,p.pink)+dot(12,12,7.5,p.paper)+dot(12,12,4.5,p.red)+dot(12,12,1.8,p.paper),
    bolt: fill('M14 1 2 14h8l-1 9L23 9h-8l1-8Z',p.gold)+fill('M14 1 2 14h5l8-12Z',p.sky),
    heart: fill(heart,p.pink)+line('M5 7c0-2 2-3 4-2',p.paper,1.8)+fill('M12 22v-5l8-8 2 3Z',p.red),
    info: dot(12,12,11,p.blue)+dot(12,6.5,1.4,p.paper)+rect(10.5,10,3,8,p.paper,1.3),
    help: dot(12,12,11,p.violet)+line('M8 8a4 4 0 1 1 8 0c0 3-4 3-4 6',p.paper,2.5)+dot(12,18,1.3,p.paper),
    alert: fill('M10 2c1-2 3-2 4 0l9 18c1 2 0 3-2 3H3c-2 0-3-1-2-3Z',p.gold)+rect(10.5,7,3,8,p.navy,1.5)+dot(12,18,1.5,p.navy),
    moon: fill('M19 2c-8 4-7 15 3 17A11 11 0 1 1 19 2Z',p.violet)+line('M5 7a9 9 0 0 0 4 13',p.sky,2)+dot(20,5,1.4,p.gold),
    sun: line('M12 1v3m0 16v3M1 12h3m16 0h3M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2',p.ochre,2.5)+dot(12,12,7,p.gold)+dot(10,10,2.5,p.paper),
    star: fill('m12 1 3.3 7 7.7 1.2-5.5 5.4 1.3 7.6-6.8-3.6-6.8 3.6 1.3-7.6L1 9.2 8.7 8Z',p.gold)+fill('m12 1 1 9-7.6 11.2 1.3-7.6L1 9.2 8.7 8Z',p.sky),
    award: fill('m7 11-3 12 8-4 8 4-3-12Z',p.violet)+dot(12,8,7,p.gold)+dot(12,8,4.6,p.ochre)+dot(12,8,2.4,p.paper),
    clipboard: rect(3,3,18,20,p.violet,3)+rect(6,6,12,15,p.paper,1)+rect(8,1,8,6,p.blue)+line('M9 11h6m-6 4h6m-6 4h3',p.sky,1.8),
    coins: rect(1,7,13,12,p.ochre,3)+'<ellipse cx="7.5" cy="7" rx="6.5" ry="3.5" fill="'+p.gold+'"/>'+line('M3 12c3 2 6 2 9 0m-9 4c3 2 6 2 9 0',p.gold,1.4)+rect(10,15,13,6,p.ochre,3)+'<ellipse cx="16.5" cy="15" rx="6.5" ry="3.5" fill="'+p.gold+'"/>'+line('M14 14h4',p.paper,1.3),
    'trend-up': line('M2 18l6-6 5 3 8-10',p.green,3.7)+fill('M14 2h9v10Z',p.mint)+dot(3,18,2,p.mint),
    'trend-down': line('M2 6l6 6 5-3 8 10',p.red,3.7)+fill('M14 22h9v-10Z',p.pink)+dot(3,6,2,p.pink),
    flame: fill('M12 3c1 5-3 6-3 10a3 3 0 0 0 6 0c0-1-.4-2-1-3 3 1 5 4 5 7a7 7 0 0 1-14 0c0-5 5-8 7-14Z',p.pink)+fill('M12 12c2 3 4 5 2 8s-6 1-5-2Z',p.gold),
    snowflake: line('M12 1v22M2 6l20 12M2 18 22 6',p.blue,2.5)+line('M8 3l4 4 4-4m-8 18 4-4 4 4M2 10l5-1-1-5m12 16-1-5 5-1M6 20l1-5-5-1m20-4-5-1 1-5',p.sky,1.7)+dot(12,12,2,p.paper),
    timer: rect(8,1,8,3,p.violet,1.3)+rect(11,3,2,3,p.navy,0)+dot(12,14,9,p.blue)+dot(12,14,6.5,p.paper)+line('M12 9v5l3 2',p.navy,2),
    tool: fill('m4 20 10-10-3-3L1 17c-2 3 1 6 3 3Z',p.violet)+fill('M14 1a7 7 0 0 0-4 10l3 3a7 7 0 0 0 10-8l-5 5-5-5 5-5Z',p.blue)+dot(3.5,18.5,1,p.paper),
    flask: fill('M9 3h6v7l7 10c1 2 0 3-2 3H4c-2 0-3-1-2-3l7-10Z',p.sky)+fill('M7 14h10l5 6c1 2 0 3-2 3H4c-2 0-3-1-2-3Z',p.mint)+rect(8,1,8,3,p.blue,1)+dot(10,18,1.4,p.paper)+dot(15,20,1,p.paper),
    home: rect(4,9,16,14,p.sky,0)+fill('m1 10 11-9 11 9-2 3-9-7-9 7Z',p.violet)+rect(9,15,6,8,p.blue,0)+rect(17,5,3,5,p.purple,0),
    more: dot(4,12,3,p.blue)+dot(12,12,3,p.violet)+dot(20,12,3,p.pink),
    map: fill('m1 5 7-3 8 3 7-3v17l-7 3-8-3-7 3Z',p.mint)+fill('m8 2 8 3v17l-8-3Z',p.sky)+line('M8 2v17m8-14v17',p.paper,1.3),
    'map-pin': fill('M12 24S2 15 2 10a10 10 0 0 1 20 0c0 5-10 14-10 14Z',p.pink)+dot(12,9,5,p.paper)+dot(12,9,2.4,p.red),
    lineup: rect(2,1,20,22,p.green,3)+line('M3 12h18M8 2v4h8V2M8 22v-4h8v4',p.paper,1)+dot(12,12,3,p.mint)+dot(7,9,2,p.pink)+dot(17,16,2,p.gold),
    backup: fill('M1 6V3h9l3 3h10v15H1Z',p.blue)+rect(1,9,22,13,p.sky,0)+line('M16 12a5 5 0 1 1-6-1',p.ochre,2.4)+fill('M6 8v7h7Z',p.gold),
    scales: rect(10.5,1,3,21,p.ochre,1)+rect(4,20,16,3,p.purple,1)+line('M3 6h18M5 6l-4 8m4-8 4 8m10-8-4 8m4-8 4 8',p.gold,1.5)+fill('M1 14h8c0 5-8 5-8 0Zm14 0h8c0 5-8 5-8 0Z',p.blue)+dot(12,5,2,p.gold),
    glove: fill('M6 23v-5l-4-6c-2-3 1-5 3-2l2 2V5c0-3 3-3 3 0V3c0-3 3-3 3 0v2c0-3 3-3 3 0v2c0-3 3-3 3 0v8c0 4-2 5-2 8Z',p.gold)+rect(6,19,11,4,p.violet,1)+line('M9 13h6m-6 3h6',p.paper,1.5),
    boot: fill('M3 2h8v8l4 3 6 2c2 1 3 2 2 5H2V12Z',p.gold)+rect(2,18,21,3,p.navy,0)+fill('M4 21h3v3H4Zm6 0h3v3h-3Zm7 0h3v3h-3Z',p.blue)+line('M10 10l-3 2m6 0-3 2m6 0-3 2',p.paper,1.7),
    crown: fill('m1 5 6 4 5-8 5 8 6-4-3 17H4Z',p.gold)+rect(4,18,16,4,p.ochre,0)+dot(7,12,1.3,p.blue)+dot(12,11,1.5,p.pink)+dot(17,12,1.3,p.violet),
    handshake: fill('m1 8 5-4 6 3-7 11-4-2Z',p.blue)+fill('m23 8-5-4-6 3 7 11 4-2Z',p.violet)+fill('m5 12 5-5 4 1 6 7-6 6-9-7Z',p.gold)+fill('m10 7 3-1 5 3-5 4-3-2-2 2-2-2Z',p.sky)+line('M10 16l3 3m0-6 4 4',p.ochre,1.3),
    'medal-gold': medal(p.violet,p.ochre,p.gold),
    'medal-silver': medal(p.blue,p.slate,p.sky),
    'medal-bronze': medal(p.violet,'#a57652','#d5a378')
  });
})(window);
