/**
 * houjin-tools shared.js v3
 * ① 入力自動保存・復元     ② 最近使ったツール記録
 * ③ CSV自動挿入           ④ ツール間データ引き継ぎ
 * ⑤ 自動再計算（debounce）⑥ KPI値クリックコピー
 * ⑦ 印刷スタイル          ⑧ フローティングボタン
 * ⑨ 前回値復元後に自動計算 ⑩ 万円換算リアルタイム表示
 * ⑪ URLシェア機能         ⑫ Enterキーで計算実行
 * ⑬ ダークモード対応
 */
(function () {
  'use strict';

  /* ---------------------------------------------------------------
   * 1. 入力値の自動保存・復元（localStorage）
   * ------------------------------------------------------------ */
  const PAGE_KEY = 'ht_in_' + location.pathname.split('/').pop().replace(/\.html$/, '');

  function saveInputs() {
    try {
      const data = {};
      document.querySelectorAll('input[id], select[id], textarea[id]').forEach(el => {
        if (el.type !== 'file' && el.type !== 'button') data[el.id] = el.value;
      });
      localStorage.setItem(PAGE_KEY, JSON.stringify(data));
    } catch (e) {}
  }

  function loadInputs() {
    try {
      // URLシェアのハッシュが優先
      if (loadFromHash()) return true;
      const raw = localStorage.getItem(PAGE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      let restored = false;
      Object.entries(data).forEach(([id, val]) => {
        const el = document.getElementById(id);
        if (el && el.tagName !== 'BUTTON') { el.value = val; restored = true; }
      });
      return restored;
    } catch (e) { return false; }
  }

  /* ---------------------------------------------------------------
   * 2. 最近使ったツールの記録（index.htmlで表示するため）
   * ------------------------------------------------------------ */
  const currentPage = location.pathname.split('/').pop();
  if (currentPage && currentPage !== 'index.html') {
    try {
      const recent = JSON.parse(localStorage.getItem('ht_recent') || '[]');
      const filtered = recent.filter(p => p.file !== currentPage);
      filtered.unshift({ file: currentPage, title: document.title });
      localStorage.setItem('ht_recent', JSON.stringify(filtered.slice(0, 6)));
    } catch (e) {}
  }

  /* ---------------------------------------------------------------
   * 3. CSVダウンロードボタンの自動挿入
   * ------------------------------------------------------------ */
  window.exportTableCSV = function (table, filename) {
    const rows = Array.from(table.querySelectorAll('tr')).map(tr =>
      Array.from(tr.querySelectorAll('th,td')).map(td =>
        '"' + td.textContent.trim().replace(/"/g, '""') + '"'
      ).join(',')
    );
    const blob = new Blob(['\uFEFF' + rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename || (document.title.replace(/\s+/g, '_') + '_結果.csv');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  function addCsvButtons() {
    const targets = 'table.detail, table.plan, table.ct, table.schedule, table.result-table, table.dt';
    document.querySelectorAll(targets).forEach(table => {
      if (!table.querySelector('th')) return;
      if (table.dataset.csvAdded) return;
      if (!table.offsetParent && table.closest('[style*="display:none"]')) return;
      table.dataset.csvAdded = '1';
      const btn = document.createElement('button');
      btn.textContent = 'CSVダウンロード';
      btn.className = 'ht-csv-btn';
      btn.style.cssText = 'margin-top:8px;padding:5px 14px;background:#15803d;color:#fff;border:none;border-radius:6px;font-size:0.78rem;cursor:pointer;font-family:inherit;display:block;';
      btn.addEventListener('click', () => exportTableCSV(table));
      table.after(btn);
    });
  }

  /* ---------------------------------------------------------------
   * 4. ツール間データ引き継ぎ
   * ------------------------------------------------------------ */
  window.sendToTool = function (url, data) {
    try {
      Object.entries(data).forEach(([k, v]) =>
        localStorage.setItem('ht_off_' + k, String(v))
      );
    } catch (e) {}
    location.href = url;
  };

  window.receiveHandoff = function (fieldMap) {
    let received = false;
    Object.entries(fieldMap).forEach(([key, id]) => {
      const val = localStorage.getItem('ht_off_' + key);
      if (val !== null) {
        const el = document.getElementById(id);
        if (el) { el.value = val; el.dispatchEvent(new Event('change', { bubbles: true })); received = true; }
        localStorage.removeItem('ht_off_' + key);
      }
    });
    return received;
  };

  /* ---------------------------------------------------------------
   * 5. 自動再計算（debounce 600ms）
   * ------------------------------------------------------------ */
  let _autoTimer = null;
  let _suppressScroll = false;

  const _origScrollIntoView = Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView = function (...args) {
    if (!_suppressScroll) _origScrollIntoView.apply(this, args);
  };

  function clickCalcBtn(targetEl) {
    let btn = null;
    let el = targetEl ? targetEl.parentElement : null;
    while (el && el !== document.body) {
      btn = el.querySelector('.btn-calc');
      if (btn) break;
      el = el.parentElement;
    }
    if (!btn) btn = document.querySelector('.btn-calc');
    if (!btn) return;
    _suppressScroll = true;
    try { btn.click(); } catch (e) {}
    _suppressScroll = false;
  }

  function triggerAutoCalc(targetEl) {
    clearTimeout(_autoTimer);
    _autoTimer = setTimeout(() => clickCalcBtn(targetEl), 600);
  }

  /* ---------------------------------------------------------------
   * 6. KPI値クリックコピー & 印刷ボタン
   * ------------------------------------------------------------ */
  function addCopyToKpi() {
    document.querySelectorAll('.kpi .val:not([data-copy])').forEach(valEl => {
      valEl.dataset.copy = '1';
      valEl.title = 'クリックで数値をコピー';
      valEl.style.cursor = 'pointer';
      valEl.addEventListener('click', function () {
        const num = this.textContent.trim().replace(/[^0-9\-]/g, '');
        if (!num) return;
        navigator.clipboard.writeText(num).then(() => {
          const orig = this.textContent;
          const origColor = this.style.color;
          this.textContent = 'コピー!';
          this.style.color = '#15803d';
          setTimeout(() => { this.textContent = orig; this.style.color = origColor; }, 1000);
        }).catch(() => {});
      });
    });
  }

  function addPrintBtn() {
    const selectors = ['#resultCard', '#resultArea', '#resultContent', '#resultMain', '#results'];
    selectors.forEach(sel => {
      const el = document.querySelector(sel);
      if (!el || el.dataset.printAdded || el.style.display === 'none') return;
      el.dataset.printAdded = '1';
      const btn = document.createElement('button');
      btn.textContent = '印刷';
      btn.className = 'ht-print-btn';
      btn.style.cssText = 'margin-top:10px;padding:6px 16px;background:#475569;color:#fff;border:none;border-radius:6px;font-size:0.78rem;cursor:pointer;font-family:inherit;';
      btn.addEventListener('click', () => window.print());
      el.appendChild(btn);
    });
  }

  /* ---------------------------------------------------------------
   * 7. AIくさいデザインパターンの上書き（全ツールページ共通）
   * ・card h2 の重い青いborder-bottom → 軽い区切り線
   * ・btn-calc の full-width → デスクトップでは auto width（中央配置）
   * ・サブヘッドのUPPERCASE対策（念のため）
   * ------------------------------------------------------------ */
  function injectDesignOverrides() {
    if (document.getElementById('ht-design-override') || currentPage === 'index.html') return;
    const s = document.createElement('style');
    s.id = 'ht-design-override';
    s.textContent = `
      /* card h2: heavy blue underline → subtle separator */
      .card h2 {
        border-bottom: 1px solid #e8ecf0 !important;
        color: #0f172a !important;
        font-size: 1rem !important;
      }
      /* section heading uppercase 廃止 */
      .card h2, .subhead {
        text-transform: none !important;
        letter-spacing: normal !important;
      }
      /* btn-calc: full-width → centered auto-width on desktop */
      @media (min-width: 520px) {
        .btn-calc {
          width: auto !important;
          min-width: 200px !important;
          padding-left: 40px !important;
          padding-right: 40px !important;
          display: block !important;
          margin-left: auto !important;
          margin-right: auto !important;
          border-radius: 8px !important;
          font-size: 0.95rem !important;
          letter-spacing: 0.01em !important;
        }
      }
      /* フォーム入力のフォーカスリング（洗練された印象） */
      input[type=number]:focus,
      input[type=text]:focus,
      input[type=email]:focus,
      select:focus,
      textarea:focus {
        outline: none !important;
        border-color: #1a3a5c !important;
        box-shadow: 0 0 0 3px rgba(26,58,92,0.12) !important;
      }
      /* ラベルの色を少し落ち着かせる */
      .input-group label { color: #475569 !important; }
      /* info-box / warn-box に少し丸みを */
      .info-box, .warn-box { border-radius: 0 8px 8px 0 !important; }
      /* card hover */
      .card { transition: box-shadow 0.2s !important; }
    `;
    document.head.appendChild(s);
  }

  /* ---------------------------------------------------------------
   * 8. 印刷スタイル
   * ------------------------------------------------------------ */
  function injectPrintStyles() {
    if (document.getElementById('ht-print-style')) return;
    const s = document.createElement('style');
    s.id = 'ht-print-style';
    s.textContent = `
      @media print {
        @page { margin: 15mm; }
        .btn-calc, .ht-csv-btn, .ht-print-btn, #ht-fab { display: none !important; }
        header { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        body { background: white !important; }
        .card { box-shadow: none !important; border: 1px solid #ddd !important; }
        [id*="result"] { display: block !important; }
        .kpi { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        table th { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .ht-man-hint { display: none !important; }
      }
    `;
    document.head.appendChild(s);
  }

  /* ---------------------------------------------------------------
   * 8. フローティングボタン（ページトップ・ホーム・シェア）
   * ------------------------------------------------------------ */
  function addFab() {
    if (document.getElementById('ht-fab') || currentPage === 'index.html') return;
    const fab = document.createElement('div');
    fab.id = 'ht-fab';
    fab.style.cssText = 'position:fixed;bottom:20px;right:18px;display:flex;flex-direction:column;align-items:center;gap:8px;z-index:9999;';

    const btnStyle = 'width:40px;height:40px;border-radius:8px;border:none;cursor:pointer;font-size:0.7rem;font-weight:700;letter-spacing:0.03em;box-shadow:0 1px 4px rgba(0,0,0,0.18);transition:opacity 0.3s,box-shadow 0.15s;font-family:inherit;display:flex;align-items:center;justify-content:center;line-height:1;';

    // ページトップ
    const topBtn = document.createElement('button');
    topBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="2,9 7,4 12,9"/></svg>';
    topBtn.title = 'ページトップへ';
    topBtn.style.cssText = btnStyle + 'background:#1a3a5c;color:#fff;opacity:0;';
    topBtn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
    topBtn.addEventListener('mouseenter', () => topBtn.style.boxShadow = '0 3px 10px rgba(0,0,0,0.28)');
    topBtn.addEventListener('mouseleave', () => topBtn.style.boxShadow = '0 1px 4px rgba(0,0,0,0.18)');
    window.addEventListener('scroll', () => {
      topBtn.style.opacity = window.scrollY > 300 ? '1' : '0';
    }, { passive: true });

    // シェアボタン
    const shareBtn = document.createElement('button');
    shareBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="2.5" r="1.5"/><circle cx="11" cy="11.5" r="1.5"/><circle cx="3" cy="7" r="1.5"/><line x1="4.4" y1="7.7" x2="9.6" y2="10.8"/><line x1="9.6" y1="3.2" x2="4.4" y2="6.3"/></svg>';
    shareBtn.title = '入力値をURLでシェア';
    shareBtn.style.cssText = btnStyle + 'background:#fff;color:#1a3a5c;border:1px solid #e2e8f0;';
    shareBtn.addEventListener('click', shareCurrentState);
    shareBtn.addEventListener('mouseenter', () => shareBtn.style.boxShadow = '0 3px 10px rgba(0,0,0,0.18)');
    shareBtn.addEventListener('mouseleave', () => shareBtn.style.boxShadow = '0 1px 4px rgba(0,0,0,0.18)');

    // ホーム
    const homeBtn = document.createElement('a');
    homeBtn.href = 'index.html';
    homeBtn.title = 'ツール一覧へ';
    homeBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1,6 7,1 13,6"/><polyline points="3,5.5 3,13 11,13 11,5.5"/><rect x="5" y="9" width="4" height="4" rx="0.5"/></svg>';
    homeBtn.style.cssText = btnStyle + 'background:#fff;color:#1a3a5c;border:1px solid #e2e8f0;text-decoration:none;';
    homeBtn.addEventListener('mouseenter', () => homeBtn.style.boxShadow = '0 3px 10px rgba(0,0,0,0.18)');
    homeBtn.addEventListener('mouseleave', () => homeBtn.style.boxShadow = '0 1px 4px rgba(0,0,0,0.18)');

    fab.appendChild(topBtn);
    fab.appendChild(shareBtn);
    fab.appendChild(homeBtn);
    document.body.appendChild(fab);
  }

  /* ---------------------------------------------------------------
   * 9. トースト通知
   * ------------------------------------------------------------ */
  function showToast(msg, isError) {
    const toast = document.createElement('div');
    toast.style.cssText = [
      'position:fixed', 'bottom:76px', 'left:50%', 'transform:translateX(-50%)',
      'background:' + (isError ? '#dc2626' : '#1a3a5c'),
      'color:#fff', 'padding:9px 20px', 'border-radius:20px',
      'font-size:0.85rem', 'z-index:10000', 'opacity:0',
      'transition:opacity 0.25s', 'pointer-events:none',
      'white-space:nowrap', 'box-shadow:0 2px 12px rgba(0,0,0,0.2)',
    ].join(';');
    toast.textContent = msg;
    document.body.appendChild(toast);
    requestAnimationFrame(() => { toast.style.opacity = '1'; });
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 2500);
  }

  /* ---------------------------------------------------------------
   * 10. 万円換算リアルタイム表示
   * input[type=number] の下に「= 350万円」と自動表示
   * ------------------------------------------------------------ */
  function addManDisplay() {
    document.querySelectorAll('input[type=number]:not([data-man])').forEach(input => {
      // max属性が小さければ金額入力ではない（割合・人数など）
      const maxVal = parseFloat(input.max);
      if (!isNaN(maxVal) && maxVal <= 200) return;

      input.dataset.man = '1';
      const hint = document.createElement('span');
      hint.className = 'ht-man-hint';
      hint.style.cssText = 'font-size:0.72rem;color:#888;margin-top:2px;display:block;min-height:1em;line-height:1;';
      input.insertAdjacentElement('afterend', hint);

      function update() {
        const v = parseFloat(input.value);
        if (!v || isNaN(v) || Math.abs(v) < 10000) { hint.textContent = ''; return; }
        const abs = Math.abs(v);
        const sign = v < 0 ? '−' : '= ';
        if (abs >= 100000000) {
          hint.textContent = sign + (abs / 100000000).toFixed(2).replace(/\.?0+$/, '') + '億円';
        } else {
          hint.textContent = sign + (abs / 10000).toFixed(1).replace(/\.0$/, '') + '万円';
        }
      }
      input.addEventListener('input', update);
      update();
    });
  }

  /* ---------------------------------------------------------------
   * 11. URLシェア機能
   * ------------------------------------------------------------ */
  function encodeState(obj) {
    try { return btoa(unescape(encodeURIComponent(JSON.stringify(obj)))); } catch (e) { return ''; }
  }

  function decodeState(str) {
    try { return JSON.parse(decodeURIComponent(escape(atob(str)))); } catch (e) { return null; }
  }

  function loadFromHash() {
    const m = location.hash.match(/^#s=(.+)/);
    if (!m) return false;
    const data = decodeState(m[1]);
    if (!data) return false;
    Object.entries(data).forEach(([id, val]) => {
      const el = document.getElementById(id);
      if (el && el.tagName !== 'BUTTON') el.value = val;
    });
    // ハッシュを消してURLをきれいに
    history.replaceState(null, '', location.pathname);
    return true;
  }

  function shareCurrentState() {
    const data = {};
    document.querySelectorAll('input[id], select[id], textarea[id]').forEach(el => {
      if (el.type !== 'file' && el.type !== 'button') data[el.id] = el.value;
    });
    const encoded = encodeState(data);
    if (!encoded) { showToast('シェア失敗', true); return; }
    const url = location.origin + location.pathname + '#s=' + encoded;
    navigator.clipboard.writeText(url)
      .then(() => showToast('URLをクリップボードにコピーしました！'))
      .catch(() => {
        // フォールバック: プロンプトで表示
        prompt('このURLをコピーしてシェアしてください：', url);
      });
  }

  /* ---------------------------------------------------------------
   * 12. Enterキーで計算実行
   * ------------------------------------------------------------ */
  function bindEnterCalc() {
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      if (!e.target.matches('input[type=number], input[type=text], select')) return;
      e.preventDefault();
      clearTimeout(_autoTimer); // debounce をキャンセルして即実行
      clickCalcBtn(e.target);
    });
  }

  /* ---------------------------------------------------------------
   * 13. ダークモード対応
   * ------------------------------------------------------------ */
  function injectDarkMode() {
    if (document.getElementById('ht-dark-style')) return;
    const s = document.createElement('style');
    s.id = 'ht-dark-style';
    s.textContent = `
      @media (prefers-color-scheme: dark) {
        body { background: #111827 !important; color: #e2e8f0 !important; }
        header { background: #0f2440 !important; }
        .card { background: #1f2937 !important; box-shadow: 0 2px 10px rgba(0,0,0,0.4) !important; color: #e2e8f0 !important; }
        .card h2 { color: #93c5fd !important; }
        .card p { color: #9ca3af !important; }
        .card .tag { background: #1e3a5f !important; color: #93c5fd !important; }
        input, select, textarea {
          background: #374151 !important; color: #e2e8f0 !important;
          border-color: #4b5563 !important;
        }
        input:focus, select:focus, textarea:focus { border-color: #60a5fa !important; }
        .input-group label { color: #9ca3af !important; }
        .info-box { background: #1e3a5f !important; color: #bfdbfe !important; }
        .warn-box { background: #422006 !important; color: #fde68a !important; }
        .subhead { color: #93c5fd !important; border-color: #374151 !important; }
        table.dt th, table.rt th { background: #1e3a5f !important; }
        table.dt td, table.rt td { border-color: #374151 !important; color: #d1d5db !important; }
        table.dt td:first-child, table.rt td:first-child { color: #9ca3af !important; }
        table.dt tr.total td { background: #1e3a5f !important; color: #93c5fd !important; }
        table.dt tr.section td { background: #1f2937 !important; color: #93c5fd !important; }
        .kpi.blue { background: #1e3a5f !important; border-color: #3b82f6 !important; }
        .kpi.red  { background: #4c0519 !important; border-color: #f43f5e !important; }
        .kpi.green{ background: #14532d !important; border-color: #22c55e !important; }
        .kpi label { color: #9ca3af !important; }
        .section-title { color: #93c5fd !important; border-color: #374151 !important; }
        .note { color: #6b7280 !important; }
        footer { color: #4b5563 !important; }
        .ht-man-hint { color: #6b7280 !important; }
        /* index.html */
        .search-wrap input { background: #1f2937 !important; color: #e2e8f0 !important; border-color: #4b5563 !important; }
        .search-count { color: #6b7280 !important; }
        .recent-chip { background: #1f2937 !important; border-color: #374151 !important; color: #93c5fd !important; }
        .fav-chip { background: #422006 !important; border-color: #92400e !important; color: #fde68a !important; }
        .fav-btn { color: #4b5563 !important; }
        .fav-btn.on { color: #f59e0b !important; }
        .cat-tab { background: #1f2937 !important; border-color: #374151 !important; color: #9ca3af !important; }
        .cat-tab.active { background: #1e3a5f !important; color: #93c5fd !important; border-color: #3b82f6 !important; }
        .cat-tab:hover { border-color: #60a5fa !important; color: #93c5fd !important; }
      }
    `;
    document.head.appendChild(s);
  }

  /* ---------------------------------------------------------------
   * 初期化
   * ------------------------------------------------------------ */
  window.addEventListener('DOMContentLoaded', () => {
    const restored = loadInputs();
    addCsvButtons();
    addFab();
    injectDesignOverrides();
    injectPrintStyles();
    injectDarkMode();
    addManDisplay();
    bindEnterCalc();

    // 前回値またはURLシェアから復元された場合は自動計算
    if (restored) {
      setTimeout(() => clickCalcBtn(null), 200);
    }

    // DOM変化を監視（計算後に動的生成される要素に対応）
    const obs = new MutationObserver(() => {
      addCsvButtons();
      addCopyToKpi();
      addPrintBtn();
      addManDisplay();
    });
    obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });

    // 入力変更時: 保存 + 自動再計算
    document.addEventListener('change', (e) => {
      saveInputs();
      if (e.target.matches('input, select, textarea') && !e.target.matches('[data-no-auto]')) {
        triggerAutoCalc(e.target);
      }
    }, { passive: true });

    document.addEventListener('input', (e) => {
      saveInputs();
      if (e.target.matches('input[type="number"], input[type="text"], textarea') && !e.target.matches('[data-no-auto]')) {
        triggerAutoCalc(e.target);
      }
    }, { passive: true });
  });
})();
