/**
 * houjin-tools shared.js
 * 機能: ① 入力値の自動保存・復元  ② 最近使ったツール記録
 *       ③ CSVダウンロードボタン自動挿入  ④ ツール間データ引き継ぎ
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
      if (!raw) return;
      const data = JSON.parse(raw);
      Object.entries(data).forEach(([id, val]) => {
        const el = document.getElementById(id);
        if (el && el.tagName !== 'BUTTON') el.value = val;
      });
    } catch (e) {}
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
    const targets = 'table.detail, table.plan, table.ct, table.schedule, table.result-table';
    document.querySelectorAll(targets).forEach(table => {
      if (!table.querySelector('th')) return;
      if (table.dataset.csvAdded) return;
      table.dataset.csvAdded = '1';
      const btn = document.createElement('button');
      btn.textContent = 'CSVダウンロード';
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
   * 初期化
   * ------------------------------------------------------------ */
  window.addEventListener('DOMContentLoaded', () => {
    loadInputs();
    addCsvButtons();
    // CSVボタンは計算後に動的生成されるテーブルにも対応
    const obs = new MutationObserver(addCsvButtons);
    obs.observe(document.body, { childList: true, subtree: true });
    document.addEventListener('change', saveInputs, { passive: true });
    document.addEventListener('input',  saveInputs, { passive: true });
  });
})();
