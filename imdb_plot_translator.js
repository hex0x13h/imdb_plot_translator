// ==UserScript==
// @name         IMDb Plot Translator (Google)
// @namespace    https://your.namespace.example/
// @version      1.0.0
// @description  Translate IMDb plot with Google endpoint. Block sits below the original, each line breaks, with loading spinner.
// @description:zh-CN 使用 Google 翻译 IMDb 简介。
// @author       hex0x13h
// @match        *://www.imdb.com/title/tt*
// @grant        GM.xmlHttpRequest
// @connect      translate.googleapis.com
// ==/UserScript==

(function () {
  'use strict';

  // ===== 配置 =====
  const config = {
    targetLang: 'zh-CN',  // 目标语言
    autoTranslate: true,  // 是否自动翻译
    style: `
      .imdb-cn-plot-wrap{
        margin-top: 10px;
        padding: 12px 14px;
        background: rgba(255,255,255,.05);
        border-left: 3px solid #ffd166;
        border-radius: 6px;
      }
      .imdb-cn-plot-title{
        display:block;                 /* 独立一行 */
        font-weight: 700;
        color: #ffd166;
        margin-bottom: 6px;
      }
      .imdb-cn-plot-text{
        display:block;                 /* 独立一行 */
        font-size: 1.05em;
        line-height: 1.6;
        color: #e8e8e8;
        text-shadow: 0 1px 1px rgba(0,0,0,.25);
        white-space: pre-wrap;
      }
      .imdb-cn-plot-action{
        display:block;                 /* 独立一行 */
        margin-top: 10px;
        cursor: pointer;
        font-size: .95em;
        color: #99c1ff;
        text-decoration: underline;
        width: fit-content;
      }
      .imdb-cn-plot-spinner{
        display:inline-block;
        width: 14px; height: 14px;
        border: 2px solid rgba(255,255,255,.35);
        border-top-color: #ffd166;
        border-radius: 50%;
        vertical-align: -2px;
        margin-right: 8px;
        animation: imdb-cn-spin 1s linear infinite;
      }
      @keyframes imdb-cn-spin { to { transform: rotate(360deg) } }
    `
  };

  // ===== 工具 =====
  function ensureStyle() {
    if (document.getElementById('imdb-cn-plot-style')) return;
    const s = document.createElement('style');
    s.id = 'imdb-cn-plot-style';
    s.textContent = config.style;
    document.head.appendChild(s);
  }

  function gmGet(url) {
    return new Promise(resolve => GM.xmlHttpRequest({
      method: 'GET',
      url,
      onload: (res) => (res.status >= 200 && res.status < 400) ? resolve(res.responseText) : resolve(),
      onerror: () => resolve()
    }));
  }

  async function translateText(text) {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(config.targetLang)}&dt=t&q=${encodeURIComponent(text)}`;
    const raw = await gmGet(url);
    if (!raw) return;
    try {
      const data = JSON.parse(raw);
      return (data[0] || []).map(part => part[0]).join('');
    } catch (_) { return; }
  }

  function getPlotContainerAndText() {
    // 优先拿“Plot”模块
    const plotContainer = document.querySelector('[data-testid="plot"]');
    if (plotContainer) {
      // 可能有不同断点的文本节点
      const textEl = plotContainer.querySelector('[data-testid^="plot-"]') || plotContainer;
      const text = (textEl.innerText || textEl.textContent || '').trim();
      if (text && !/^add a plot/i.test(text)) {
        return { container: plotContainer, text };
      }
    }
    // 兜底：Storyline 段
    const story = document.querySelector('[data-testid="storyline-plot-summary"]');
    if (story) {
      const t = (story.innerText || story.textContent || '').trim();
      if (t) return { container: story, text: t };
    }
    return null;
  }

  function makeSpinner(label = '翻译中…') {
    const span = document.createElement('span');
    span.innerHTML = `<i class="imdb-cn-plot-spinner"></i>${label}`;
    return span;
  }

  function insertTranslatedBlockBelow(container, text, urlForRefresh) {
    ensureStyle();
    // 若已存在就更新内容
    let wrap = container.parentElement.querySelector('.imdb-cn-plot-wrap');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.className = 'imdb-cn-plot-wrap';

      const title = document.createElement('span');
      title.className = 'imdb-cn-plot-title';
      title.textContent = `翻译 (${config.targetLang})：`;

      const body = document.createElement('span');
      body.className = 'imdb-cn-plot-text';
      body.textContent = text;

      const action = document.createElement('a');
      action.className = 'imdb-cn-plot-action';
      action.textContent = '刷新翻译';
      action.href = 'javascript:void(0)';
      action.addEventListener('click', async () => {
        const spinner = makeSpinner();
        action.replaceWith(spinner);
        const latest = getPlotContainerAndText();
        const t = latest ? await translateText(latest.text) : null;
        if (t) body.textContent = t;
        // 恢复按钮
        spinner.replaceWith(action);
      });

      wrap.appendChild(title);
      wrap.appendChild(body);
      wrap.appendChild(action);
      // 放到原文块的“下面”
      container.insertAdjacentElement('afterend', wrap);
    } else {
      wrap.querySelector('.imdb-cn-plot-text').textContent = text;
    }
  }

  async function runOnce() {
    const found = getPlotContainerAndText();
    if (!found) return;

    if (config.autoTranslate) {
      // 先插一个“加载中”的块
      insertTranslatedBlockBelow(found.container, '……', location.href);
      const wrap = found.container.parentElement.querySelector('.imdb-cn-plot-wrap');
      const body = wrap.querySelector('.imdb-cn-plot-text');
      const action = wrap.querySelector('.imdb-cn-plot-action');

      const spinner = makeSpinner();
      body.textContent = '';
      body.appendChild(spinner);

      const t = await translateText(found.text);
      if (t) {
        body.textContent = t;
      } else {
        body.textContent = '翻译失败，请稍后重试。';
      }
    } else {
      // 不自动翻译：只放按钮
      ensureStyle();
      const btn = document.createElement('a');
      btn.className = 'imdb-cn-plot-action';
      btn.textContent = `翻译为 ${config.targetLang}`;
      btn.href = 'javascript:void(0)';
      btn.addEventListener('click', async () => {
        const spinner = makeSpinner();
        btn.replaceWith(spinner);
        const t = await translateText(found.text);
        insertTranslatedBlockBelow(found.container, t || '翻译失败，请稍后重试。', location.href);
        spinner.remove();
      });
      found.container.insertAdjacentElement('afterend', btn);
    }
  }

  // ===== IMDb 为 SPA：监听路由和 DOM =====
  let lastPath = location.pathname;
  setInterval(() => {
    if (location.pathname !== lastPath) {
      lastPath = location.pathname;
      document.querySelectorAll('.imdb-cn-plot-wrap,.imdb-cn-plot-action').forEach(n => n.remove());
      runOnce();
    }
  }, 700);

  const mo = new MutationObserver(() => {
    const exists = document.querySelector('[data-testid="plot"]') || document.querySelector('[data-testid="storyline-plot-summary"]');
    const inserted = document.querySelector('.imdb-cn-plot-wrap');
    if (exists && !inserted) runOnce();
  });
  mo.observe(document.documentElement, { childList: true, subtree: true });

  runOnce();
})();
