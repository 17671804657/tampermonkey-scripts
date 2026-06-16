// ==UserScript==
// @name         B站推荐视频历史记录
// @namespace    https://www.bilibili.com
// @version      1.4.2
// @description  记录B站首页推荐视频流的历史批次，支持回溯查看"换一换"之前的推荐内容
// @author       Senior Developer
// @match        https://www.bilibili.com/
// @match        https://www.bilibili.com/?*
// @icon         https://www.bilibili.com/favicon.ico
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  console.log('[BiliHistory] 脚本已加载，等待B站页面渲染...');

  // ============ 配置 ============
  const MAX_BATCHES = 30;
  const STORAGE_KEY = 'bili_recommend_history';

  // ============ 核心状态 ============
  let historyPanel = null;
  let historyBtn = null;
  let injectRetryCount = 0;
  const MAX_RETRIES = 30;

  // ============ 数据操作 ============
  function loadHistory() {
    try {
      return JSON.parse(GM_getValue(STORAGE_KEY, '[]'));
    } catch {
      return [];
    }
  }

  function saveHistory(batches) {
    GM_setValue(STORAGE_KEY, JSON.stringify(batches.slice(0, MAX_BATCHES)));
  }

  function snapshotCurrentCards() {
    // B站视频卡片可能在两种容器中：
    // 1. .bili-video-card__wrap (推荐feed流)
    // 2. .feed-card 内的卡片
    const cards = document.querySelectorAll(
      '.bili-video-card__wrap, .feed-card .bili-video-card__wrap'
    );
    if (cards.length === 0) {
      console.log('[BiliHistory] 未找到视频卡片，跳过快照');
      return;
    }

    const batch = {
      id: Date.now(),
      time: new Date().toLocaleString('zh-CN'),
      videos: [],
    };

    cards.forEach((card) => {
      const titleEl = card.querySelector('.bili-video-card__info--tit');
      const linkEl = card.querySelector('a[href*="/video/BV"]');
      const authorEl = card.querySelector('.bili-video-card__info--author');

      if (titleEl && linkEl) {
        batch.videos.push({
          title: titleEl.textContent.trim(),
          url: linkEl.href,
          author: authorEl?.textContent?.trim() || '',
        });
      }
    });

    if (batch.videos.length > 0) {
      const history = loadHistory();
      const lastBatch = history[0];
      if (lastBatch) {
        const lastUrls = lastBatch.videos.map((v) => v.url).sort().join(',');
        const curUrls = batch.videos.map((v) => v.url).sort().join(',');
        if (lastUrls === curUrls) {
          console.log('[BiliHistory] 与上批相同，跳过记录');
          return;
        }
      }
      history.unshift(batch);
      saveHistory(history);
      console.log(`[BiliHistory] 已记录第 ${history.length} 批，${batch.videos.length} 个视频`);
      updateBadge();
    }
  }

  function updateBadge() {
    const history = loadHistory();
    if (historyBtn && historyBtn.isConnected) {
      historyBtn.setAttribute('data-count', Math.min(history.length, 99));
      const badge = historyBtn.querySelector('.count-badge');
      if (badge) badge.textContent = Math.min(history.length, 99);
    }
  }

  // ============ UI 创建 ============
  function createStyles() {
    const css = `
      .bili-history-btn-wrap {
        position: fixed !important; z-index: 99999 !important;
        display: flex !important; justify-content: center;
      }
      .bili-history-btn {
        width: 40px; height: 90px;
        display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px;
        border: 0.5px solid #2d2d33; border-radius: 8px;
        background: #1a1a1f; cursor: pointer;
        transition: 0.2s; position: relative;
        font-family: -apple-system,BlinkMacSystemFont,"Helvetica Neue",Helvetica,Arial,"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;
        user-select: none;
      }
      .bili-history-btn:hover { background: #2d2d33; }
      .bili-history-btn:active { opacity: 0.7; }
      .bili-history-btn svg { width: 14px; height: 14px; color: #9499a0; flex-shrink: 0; }
      .bili-history-btn .btn-label {
        writing-mode: vertical-rl; font-size: 14px; color: #e3e5e8;
        letter-spacing: 2px; line-height: 1;
      }
      .bili-history-btn .count-badge {
        position: absolute; top: -5px; right: -5px; min-width: 16px; height: 16px;
        padding: 0 4px; background: #fb7299; color: #fff; font-size: 10px;
        border-radius: 8px; display: flex; align-items: center; justify-content: center;
        font-weight: 500; line-height: 1;
      }
      .bili-history-btn[data-count="0"] .count-badge,
      .bili-history-btn:not([data-count]) .count-badge { display: none; }

      .bili-history-overlay {
        position: fixed; inset: 0; background: rgba(0,0,0,0.35);
        backdrop-filter: blur(4px); z-index: 100000;
        animation: bh-fadeIn 0.2s ease;
        display: flex; align-items: flex-start; justify-content: center;
        padding-top: min(80px, 10vh);
      }
      @keyframes bh-fadeIn { from{opacity:0} to{opacity:1} }

      .bili-history-panel {
        width: min(560px, 94vw); max-height: 78vh; background: #fff;
        border-radius: 16px; display: flex; flex-direction: column; overflow: hidden;
        box-shadow: 0 24px 80px rgba(0,0,0,0.2), 0 0 0 1px rgba(0,0,0,0.06);
        animation: bh-slideUp 0.3s cubic-bezier(0.16,1,0.3,1);
      }
      @keyframes bh-slideUp {
        from{opacity:0;transform:translateY(24px) scale(0.96)}
        to{opacity:1;transform:translateY(0) scale(1)}
      }

      .bh-panel-header {
        display: flex; align-items: center; justify-content: space-between;
        padding: 20px 24px 16px; border-bottom: 1px solid #f0f0f0;
      }
      .bh-panel-title {
        font-size: 17px; font-weight: 600; color: #18191c;
        display: flex; align-items: center; gap: 8px;
      }
      .bh-panel-title svg { width: 20px; height: 20px; color: #fb7299; }
      .bh-panel-close {
        width: 34px; height: 34px; border-radius: 8px; border: none;
        background: #f6f7f8; cursor: pointer; display: flex; align-items: center;
        justify-content: center; transition: all 0.2s; color: #666;
      }
      .bh-panel-close:hover { background: #ebebeb; color: #333; }
      .bh-panel-close svg { width: 18px; height: 18px; }

      .bh-panel-actions {
        padding: 10px 24px; display: flex; align-items: center; justify-content: space-between;
        border-bottom: 1px solid #f5f5f5;
      }
      .bh-panel-count { font-size: 13px; color: #9499a0; }
      .bh-panel-clear {
        font-size: 13px; color: #9499a0; cursor: pointer; background: none;
        border: none; padding: 4px 10px; border-radius: 6px; transition: all 0.2s;
      }
      .bh-panel-clear:hover { color: #e24b4a; background: #fcebeb; }

      .bh-panel-list { flex: 1; overflow-y: auto; padding: 4px 16px 16px; }
      .bh-panel-list::-webkit-scrollbar { width: 4px; }
      .bh-panel-list::-webkit-scrollbar-thumb { background: #e3e5e8; border-radius: 3px; }

      .bh-batch {
        margin-bottom: 8px; border: 1px solid #f0f0f0; border-radius: 12px;
        overflow: hidden; transition: border-color 0.2s;
      }
      .bh-batch:hover { border-color: #fb7299; }

      .bh-batch-header {
        display: flex; align-items: center; justify-content: space-between;
        padding: 11px 16px; background: #fafafa; cursor: pointer; user-select: none;
        transition: background 0.15s;
      }
      .bh-batch-header:hover { background: #f3f3f5; }
      .bh-batch-time {
        font-size: 13px; font-weight: 500; color: #18191c;
        display: flex; align-items: center; gap: 6px;
      }
      .bh-batch-badge {
        font-size: 11px; padding: 2px 8px; background: #fb7299; color: #fff;
        border-radius: 10px; font-weight: 500;
      }
      .bh-batch-chevron {
        transition: transform 0.3s ease; color: #9499a0;
      }
      .bh-batch--open .bh-batch-chevron { transform: rotate(180deg); }
      .bh-batch-videos { display: none; padding: 2px 12px 12px; }
      .bh-batch--open .bh-batch-videos { display: block; }

      .bh-video {
        display: flex; align-items: center; gap: 10px; padding: 8px 4px;
        border-radius: 8px; cursor: pointer; transition: all 0.15s;
        text-decoration: none; color: inherit;
      }
      .bh-video:hover { background: #f6f7f8; }
      .bh-video-num { width: 22px; font-size: 12px; color: #9499a0; text-align: center; flex-shrink: 0; }
      .bh-video-title {
        flex: 1; font-size: 13px; color: #18191c;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }
      .bh-video:hover .bh-video-title { color: #fb7299; }
      .bh-video-arr {
        width: 14px; height: 14px; color: #c9ccd0; flex-shrink: 0;
        opacity: 0; transition: all 0.2s;
      }
      .bh-video:hover .bh-video-arr { opacity: 1; transform: translateX(2px); }

      .bh-empty {
        text-align: center; padding: 56px 24px; color: #9499a0;
      }
      .bh-empty svg { width: 48px; height: 48px; margin-bottom: 12px; opacity: 0.25; }
      .bh-empty p { font-size: 14px; margin: 0; }

      /* B站暗色模式适配 */
      [data-theme="dark"] .bili-history-btn,
      html.dark .bili-history-btn {
        background: #1a1a1f; border-color: #2d2d33;
      }
      [data-theme="dark"] .bili-history-btn:hover,
      html.dark .bili-history-btn:hover { background: #2d2d33; }
      [data-theme="dark"] .bili-history-panel,
      html.dark .bili-history-panel { background: #1e1e23; }
      [data-theme="dark"] .bh-panel-header,
      html.dark .bh-panel-header { border-bottom-color: #2d2d33; }
      [data-theme="dark"] .bh-panel-title,
      html.dark .bh-panel-title { color: #e3e5e8; }
      [data-theme="dark"] .bh-panel-close,
      html.dark .bh-panel-close { background: #2d2d33; color: #9499a0; }
      [data-theme="dark"] .bh-panel-close:hover,
      html.dark .bh-panel-close:hover { background: #3a3a42; color: #e3e5e8; }
      [data-theme="dark"] .bh-panel-actions,
      html.dark .bh-panel-actions { border-bottom-color: #2d2d33; }
      [data-theme="dark"] .bh-batch,
      html.dark .bh-batch { border-color: #2d2d33; }
      [data-theme="dark"] .bh-batch-header,
      html.dark .bh-batch-header { background: #25252b; }
      [data-theme="dark"] .bh-batch-header:hover,
      html.dark .bh-batch-header:hover { background: #2d2d33; }
      [data-theme="dark"] .bh-batch-time,
      html.dark .bh-batch-time { color: #e3e5e8; }
      [data-theme="dark"] .bh-video:hover,
      html.dark .bh-video:hover { background: #25252b; }
      [data-theme="dark"] .bh-video-title,
      html.dark .bh-video-title { color: #e3e5e8; }
    `;
    GM_addStyle(css);
  }

  // ============ 插入历史按钮 ============
  function injectHistoryButton() {
    if (historyBtn && historyBtn.isConnected) {
      // 重新定位（B站滚动或布局变化后需要）
      repositionButton();
      return true;
    }

    const rollBtn = document.querySelector('.feed-roll-btn');
    if (!rollBtn) return false;

    console.log('[BiliHistory] 找到换一换按钮区域，注入历史按钮');

    const history = loadHistory();
    const count = Math.min(history.length, 99);

    const wrap = document.createElement('div');
    wrap.className = 'bili-history-btn-wrap';
    wrap.innerHTML = `
      <button class="bili-history-btn" data-count="${count}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <polyline points="12 6 12 12 16 14"/>
        </svg>
        <span class="btn-label">历史记录</span>
        <span class="count-badge">${count}</span>
      </button>
    `;

    // 注入到 body，用 fixed 定位跟随 .feed-roll-btn
    document.body.appendChild(wrap);
    historyBtn = wrap.querySelector('.bili-history-btn');
    historyBtn.addEventListener('click', openHistoryPanel);

    repositionButton();

    // 监听滚动和resize来重新定位
    window.addEventListener('scroll', repositionButton, { passive: true });
    window.addEventListener('resize', repositionButton, { passive: true });

    console.log('[BiliHistory] 历史按钮注入成功（悬浮定位）');
    return true;
  }

  function repositionButton() {
    if (!historyBtn || !historyBtn.isConnected) return;
    const wrap = historyBtn.parentElement;

    // 直接对齐"换一换"按钮本体，像素级对齐
    const rollBtn = document.querySelector('.feed-roll-btn .roll-btn');
    if (!rollBtn) return;

    const rect = rollBtn.getBoundingClientRect();
    wrap.style.left = Math.round(rect.left) + 'px';
    wrap.style.top  = Math.round(rect.bottom + 8) + 'px';
  }

  // ============ 历史面板 ============
  function openHistoryPanel() {
    if (historyPanel) return;

    const history = loadHistory();
    const panel = document.createElement('div');
    panel.className = 'bili-history-overlay';

    let bodyHTML = '';
    if (history.length === 0) {
      bodyHTML = `
        <div class="bh-empty">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
          </svg>
          <p>还没有推荐历史记录</p>
          <p style="font-size:12px;margin-top:6px;opacity:0.6;">首次使用请先点击「换一换」来记录</p>
        </div>`;
    } else {
      bodyHTML = history.map((batch, i) => `
        <div class="bh-batch${i === 0 ? ' bh-batch--open' : ''}">
          <div class="bh-batch-header">
            <span class="bh-batch-time">
              ${i === 0 ? '<span class="bh-batch-badge">最新</span>' : ''}
              ${batch.time} · ${batch.videos.length}个视频
            </span>
            <svg class="bh-batch-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </div>
          <div class="bh-batch-videos">
            ${batch.videos.map((v, j) => `
              <a class="bh-video" href="${v.url}" target="_blank" title="${esc(v.title)}">
                <span class="bh-video-num">${j + 1}</span>
                <span class="bh-video-title">${esc(v.title)}</span>
                <svg class="bh-video-arr" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  stroke-width="2.5" stroke-linecap="round">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </a>`).join('')}
          </div>
        </div>`).join('');
    }

    panel.innerHTML = `
      <div class="bili-history-panel">
        <div class="bh-panel-header">
          <span class="bh-panel-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
              stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
            推荐历史记录
          </span>
          <button class="bh-panel-close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        ${history.length > 0 ? `
        <div class="bh-panel-actions">
          <span class="bh-panel-count">共 ${history.length} 批记录</span>
          <button class="bh-panel-clear">清空所有记录</button>
        </div>` : ''}
        <div class="bh-panel-list">${bodyHTML}</div>
      </div>`;

    document.body.appendChild(panel);
    historyPanel = panel;

    // 关闭事件
    panel.querySelector('.bh-panel-close').addEventListener('click', closePanel);
    panel.addEventListener('click', (e) => {
      if (e.target === panel) closePanel();
    });

    // 折叠/展开
    panel.querySelectorAll('.bh-batch-header').forEach(h => {
      h.addEventListener('click', () => h.parentElement.classList.toggle('bh-batch--open'));
    });

    // 清空
    const clearBtn = panel.querySelector('.bh-panel-clear');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        saveHistory([]);
        closePanel();
        if (historyBtn?.isConnected) historyBtn.setAttribute('data-count', '0');
      });
    }

    document.addEventListener('keydown', onEscKey);
  }

  function closePanel() {
    if (!historyPanel) return;
    historyPanel.remove();
    historyPanel = null;
    document.removeEventListener('keydown', onEscKey);
  }

  function onEscKey(e) {
    if (e.key === 'Escape') closePanel();
  }

  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  // ============ 监听换一换 ============
  function watchRefreshButton() {
    const findAndBind = () => {
      const rollBtn = document.querySelector('.feed-roll-btn button, .feed-roll-btn .roll-btn');
      if (!rollBtn || rollBtn.dataset.biliHistoryBound) return false;

      rollBtn.dataset.biliHistoryBound = '1';
      console.log('[BiliHistory] 已绑定换一换按钮');

      // 先记录当前
      snapshotCurrentCards();

      // 监听点击
      rollBtn.addEventListener('click', () => {
        console.log('[BiliHistory] 检测到换一换，等待新内容加载...');
        // B站刷新推荐后新卡片在 1-2 秒内渲染
        setTimeout(() => {
          snapshotCurrentCards();
          if (historyPanel) {
            closePanel();
            openHistoryPanel();
          }
        }, 2000);
      });

      return true;
    };

    // 每 1.5 秒重试
    const timer = setInterval(() => {
      if (findAndBind()) clearInterval(timer);
    }, 1500);

    // 20 秒超时
    setTimeout(() => clearInterval(timer), 20000);
  }

  // ============ B站Vue重新渲染保护 ============
  function watchButtonRemoval() {
    // 按钮在 body 中用 fixed 定位，B站Vue不会删除它
    // 但换一换按钮可能会被重新渲染，需要重新定位
    const observer = new MutationObserver(() => {
      if (historyBtn && historyBtn.isConnected) {
        repositionButton();
      }
    });

    // 等侧边栏出现后开始监听
    const timer = setInterval(() => {
      const aside = document.querySelector('.recommended-container_floor-aside');
      if (aside) {
        observer.observe(aside, { childList: true, subtree: true });
        console.log('[BiliHistory] 布局监听已启动（自动跟踪换一换按钮位置）');
        clearInterval(timer);
      }
    }, 1000);
    setTimeout(() => clearInterval(timer), 15000);
  }

  // ============ 反复尝试注入 ============
  function retryInjection() {
    const tryInject = () => {
      injectRetryCount++;
      if (injectRetryCount > MAX_RETRIES) {
        console.log('[BiliHistory] 达到最大重试次数，停止注入');
        return;
      }

      if (injectHistoryButton()) return;

      // 还没找到 .feed-roll-btn，继续等待
      setTimeout(tryInject, 1000);
    };

    // 延迟一秒开始，让B站Vue有时间渲染
    setTimeout(tryInject, 1000);
  }

  // ============ 启动 ============
  function init() {
    createStyles();
    retryInjection();
    watchRefreshButton();
    watchButtonRemoval();

    // 初始快照
    setTimeout(snapshotCurrentCards, 3000);

    console.log('[BiliHistory] 初始化完成');
  }

  init();
})();