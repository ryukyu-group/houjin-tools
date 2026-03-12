/**
 * houjin-tools shared.js v2
 * ① 入力自動保存・復元     ② 最近使ったツール記録
 * ③ CSV自動挿入           ④ ツール間データ引き継ぎ
 * ⑤ 自動再計算（debounce）⑥ KPI値クリックコピー
 * ⑦ 印刷スタイル          ⑧ ページトップボタン
 * ⑨ 前回値復元後に自動計算
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
   * 対象: table.detail / table.plan / table.ct / table.schedule
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
      // display:none の親要素内にあるテーブルはスキップ
      if (!table.offsetParent && table.closest('[style*="display:none"]')) return;
      table.dataset.csvAdded = '1';
      const btn = document.createElement('button');
      btn.textContent = '📥 CSVダウンロード';
      btn.className = 'ht-csv-btn';
      btn.style.cssText = [
        'margin-top:8px', 'padding:5px 14px', 'background:#15803d',
        'color:#fff', 'border:none', 'border-radius:6px', 'font-size:0.78rem',
        'cursor:pointer', 'font-family:inherit', 'display:block',
      ].join(';');
      btn.addEventListener('click', () => exportTableCSV(table));
      table.after(btn);
    });
  }

  /* ---------------------------------------------------------------
   * 4. ツール間データ引き継ぎ
   * 使い方（送信側）: sendToTool('shakai-hoken-sim.html', { monthly: 400000 })
   * 使い方（受信側）: receiveHandoff({ monthly: 'kyuyo_input_id' })
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
   * 5. 自動再計算
   * 入力変更から600ms後、最寄りの .btn-calc をクリック
   * scrollIntoView は自動計算時に抑制（画面がガクガクしない）
   * ------------------------------------------------------------ */
  let _autoTimer = null;
  let _suppressScroll = false;

  const _origScrollIntoView = Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView = function (...args) {
    if (!_suppressScroll) _origScrollIntoView.apply(this, args);
  };

  function clickCalcBtn(targetEl) {
    // 変更要素の最寄りの btn-calc を探す
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
   * 6. KPI値クリックコピー & 印刷ボタン挿入
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
    // resultCard / resultArea / resultContent など visible な結果コンテナに印刷ボタンを追加
    const selectors = ['#resultCard', '#resultArea', '#resultContent', '#resultMain', '#results'];
    selectors.forEach(sel => {
      const el = document.querySelector(sel);
      if (!el || el.dataset.printAdded || el.style.display === 'none') return;
      el.dataset.printAdded = '1';
      const btn = document.createElement('button');
      btn.textContent = '🖨️ 印刷';
      btn.className = 'ht-print-btn';
      btn.style.cssText = [
        'margin-top:10px', 'padding:6px 16px', 'background:#475569',
        'color:#fff', 'border:none', 'border-radius:6px',
        'font-size:0.78rem', 'cursor:pointer', 'font-family:inherit',
      ].join(';');
      btn.addEventListener('click', () => window.print());
      el.appendChild(btn);
    });
  }

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
      }
    `;
    document.head.appendChild(s);
  }

  /* ---------------------------------------------------------------
   * 7. フローティングアクションエリア（ページトップ）
   * ------------------------------------------------------------ */
  function addFab() {
    if (document.getElementById('ht-fab') || currentPage === 'index.html') return;
    const fab = document.createElement('div');
    fab.id = 'ht-fab';
    fab.style.cssText = [
      'position:fixed', 'bottom:20px', 'right:18px',
      'display:flex', 'flex-direction:column', 'align-items:center', 'gap:8px',
      'z-index:9999',
    ].join(';');

    const btnStyle = [
      'width:42px', 'height:42px', 'border-radius:50%',
      'border:none', 'cursor:pointer', 'font-size:1.1rem',
      'box-shadow:0 2px 10px rgba(0,0,0,0.22)',
      'transition:opacity 0.3s, transform 0.15s',
      'font-family:inherit', 'display:flex',
      'align-items:center', 'justify-content:center',
    ].join(';');

    // ページトップボタン
    const topBtn = document.createElement('button');
    topBtn.textContent = '▲';
    topBtn.title = 'ページトップへ';
    topBtn.style.cssText = btnStyle + ';background:#1a3a5c;color:#fff;opacity:0;';
    topBtn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
    topBtn.addEventListener('mouseenter', () => topBtn.style.transform = 'scale(1.1)');
    topBtn.addEventListener('mouseleave', () => topBtn.style.transform = '');

    // トップへ戻るボタンは300px以上スクロール時に表示
    window.addEventListener('scroll', () => {
      topBtn.style.opacity = window.scrollY > 300 ? '1' : '0';
    }, { passive: true });

    // ホームへボタン
    const homeBtn = document.createElement('a');
    homeBtn.href = 'index.html';
    homeBtn.title = 'ツール一覧へ';
    homeBtn.style.cssText = btnStyle + ';background:#f1f5f9;color:#1a3a5c;font-size:1rem;text-decoration:none;';
    homeBtn.textContent = '🏠';
    homeBtn.addEventListener('mouseenter', () => homeBtn.style.transform = 'scale(1.1)');
    homeBtn.addEventListener('mouseleave', () => homeBtn.style.transform = '');

    fab.appendChild(topBtn);
    fab.appendChild(homeBtn);
    document.body.appendChild(fab);
  }

  /* ---------------------------------------------------------------
   * 初期化
   * ------------------------------------------------------------ */
  window.addEventListener('DOMContentLoaded', () => {
    const restored = loadInputs();
    addCsvButtons();
    addFab();
    injectPrintStyles();

    // 前回値が復元された場合は自動計算（画面ロード直後）
    if (restored) {
      setTimeout(() => clickCalcBtn(null), 200);
    }

    // DOM変化を監視（計算後に動的生成される要素に対応）
    const obs = new MutationObserver(() => {
      addCsvButtons();
      addCopyToKpi();
      addPrintBtn();
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
