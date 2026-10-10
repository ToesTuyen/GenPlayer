// Decorate interface labels, including labels rebuilt by the app after navigation.
// Player names, review copy, pitch markers and editable values stay as plain data.
(function (global) {
  "use strict";
  const api = global.GPIcons;
  const tokens = {
    "⚽":"football", "🥇":"medal-gold", "🥈":"medal-silver", "🥉":"medal-bronze",
    "🏆":"trophy", "📊":"chart", "📈":"trend-up", "📉":"trend-down",
    "💰":"wallet", "💸":"coins", "💳":"wallet", "🧠":"activity", "🤖":"sparkles",
    "💬":"message", "📋":"clipboard", "🗂":"backup", "📁":"backup",
    "📂":"backup", "🕓":"history", "🕒":"clock", "📅":"calendar",
    "⏰":"clock", "⏳":"timer", "🔄":"refresh", "🔀":"shuffle",
    "💾":"save", "✏":"edit", "📝":"edit", "🗑":"trash",
    "🔒":"lock", "🔓":"unlock", "🔑":"login", "👤":"user",
    "👥":"users", "👑":"crown", "📥":"download", "📤":"upload",
    "➕":"plus", "➖":"minus", "＋":"plus", "－":"minus", "−":"minus", "⇩":"download",
    "✅":"check-circle", "❌":"close", "⚠":"alert", "ℹ":"info",
    "💡":"info", "🔎":"search", "🔍":"search", "🎯":"target",
    "⚡":"bolt", "⚙":"settings", "⚖":"scales", "🛡":"shield",
    "📍":"map-pin", "🧤":"glove", "👟":"boot", "🏹":"chart",
    "🤝":"handshake", "🛠":"tool", "🧪":"flask", "🧊":"snowflake", "🏅":"award", "📨":"mail",
    "😎":"check-circle", "🔥":"flame", "💨":"trend-down", "🙈":"eye-off",
    "☀":"sun", "☾":"moon", "←":"arrow-left", "→":"arrow-right",
    "‹":"chevron-left", "›":"chevron-right", "✕":"close", "✓":"check"
  };
  const names = Object.keys(tokens).sort((a, b) => b.length - a.length);
  const escaped = names.map(s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp("(?:" + escaped.join("|") + ")[\\uFE0E\\uFE0F]?", "gu");
  const labels = {
    trash:"Xóa", edit:"Chỉnh sửa", close:"Đóng", plus:"Thêm", minus:"Bớt",
    "arrow-left":"Quay lại", "arrow-right":"Tiếp tục", "chevron-left":"Trước",
    "chevron-right":"Sau", bolt:"Nhập nhanh", message:"Góp ý", search:"Tìm kiếm"
  };
  const selector = [
    "button", "[data-ui-icon]", "#appTitle", "h2", "h3", ".plog-title",
    ".pop-head", ".lg-ic", ".fin-title", ".pstat-title", ".pstat-source",
    ".pstat-state", ".pstat-ai-title", ".pstat-kpi .lab", ".pm-sec", ".pm-arch-name",
    ".pm-h-raters", ".pm-h-upd", ".ps-row > span", ".empty > .big",
    ".fin-empty > .big", ".t-ic", ".ulog-badge", ".fin-type", ".gl-lock",
    ".rank-goals", ".mc-scorers"
  ].join(",");
  const exclude = [
    "svg", "img", "script", "style", "input", "textarea", "select", "option", "pre", "code",
    ".heat", ".hf-wrap", ".hf-star", ".hf-ball", ".pc-star", ".fb-stars",
    ".fb-rate", ".avatar", ".pstat-name", ".rank-name", ".gl-nm", ".fb-txt",
    ".hf-desc", ".ai-review", ".name", ".pc-name", ".mc-scorer", ".fin-name",
    ".fin-meta", ".pm-arch-desc", "[data-ui-no-icons]"
  ].join(",");

  function decorateLabel(el) {
    if (el.closest(exclude)) return;
    if (el.dataset.uiIcon) {
      if (el.dataset.uiRendered !== el.dataset.uiIcon) {
        el.innerHTML = api.render(el.dataset.uiIcon);
        el.dataset.uiRendered = el.dataset.uiIcon;
      }
      return;
    }
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      if (!node.parentElement || node.parentElement.closest(exclude)) continue;
      // These labels also contain names/timestamps supplied by members.
      if (el.matches(".pm-h-upd,.gl-lock") && node !== el.firstChild) continue;
      const value = node.nodeValue;
      pattern.lastIndex = 0;
      if (!pattern.test(value)) continue;
      pattern.lastIndex = 0;
      const fragment = document.createDocumentFragment();
      let cursor = 0, match, firstIcon;
      while ((match = pattern.exec(value))) {
        if (match.index > cursor) fragment.append(document.createTextNode(value.slice(cursor, match.index)));
        const key = match[0].replace(/[\uFE0E\uFE0F]/g, "");
        const name = tokens[key];
        const template = document.createElement("template");
        template.innerHTML = api.render(name);
        fragment.append(template.content);
        firstIcon = firstIcon || name;
        cursor = pattern.lastIndex;
      }
      if (cursor < value.length) fragment.append(document.createTextNode(value.slice(cursor)));
      // Decorative SVG must not become the only accessible name of a control.
      const button = el.closest("button");
      if (button && !button.getAttribute("aria-label")) {
        pattern.lastIndex = 0;
        if (!button.textContent.replace(pattern, "").trim()) {
          button.setAttribute("aria-label", button.title || labels[firstIcon] || "Thao tác");
        }
      }
      node.replaceWith(fragment);
    }
  }

  function decorate(root) {
    const el = root.nodeType === Node.TEXT_NODE ? root.parentElement : root;
    if (!el || !el.querySelectorAll || (el.closest && el.closest(exclude))) return;
    const host = el.closest && el.closest(selector);
    if (host) decorateLabel(host);
    else if (el.matches && el.matches(selector)) decorateLabel(el);
    el.querySelectorAll(selector).forEach(decorateLabel);
  }

  let observer;
  function mount(root) {
    decorate(root);
    if (observer) return;
    const pending = new Set();
    let scheduled = false;
    observer = new MutationObserver(changes => {
      for (const change of changes) {
        if (change.type === "characterData") pending.add(change.target);
        else for (const node of change.addedNodes) pending.add(node);
      }
      if (scheduled || !pending.size) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        const roots = Array.from(pending);
        pending.clear();
        roots.forEach(node => { if (node.isConnected) decorate(node); });
      });
    });
    observer.observe(root, {subtree:true, childList:true, characterData:true});
  }
  global.GPUIIcons = Object.freeze({mount});
})(window);
