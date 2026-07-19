// グローバル変数の定義
window.highlightOverlay = window.highlightOverlay || null;
window.controllerPanel = window.controllerPanel || null;
window.hoveredElement = window.hoveredElement || null;
window.isPaused = window.isPaused || false;

// ページ読み込み時に録画ステータスをチェックして自動復元
chrome.storage.local.get(['isRecording'], (result) => {
  if (result.isRecording) {
    setTimeout(() => {
      initCaptureEnvironment();
    }, 500);
  }
});

// ポップアップからも直接呼び出される起動関数
window.initCaptureEnvironment = function() {
  createControlPanel();
  createHighlightOverlay();
  startTracking();
};

// 1. ハイライト用うす赤い枠の生成
function createHighlightOverlay() {
  if (document.getElementById('tango-highlight-overlay')) return;
  highlightOverlay = document.createElement('div');
  highlightOverlay.id = "tango-highlight-overlay";
  highlightOverlay.style.cssText = `
    position: absolute; pointer-events: none; z-index: 2147483646;
    border: 2px solid #ef4444; background: rgba(239, 68, 68, 0.08);
    transition: all 0.1s ease; border-radius: 4px; display: none;
    box-shadow: 0 0 8px rgba(239, 68, 68, 0.4);
  `;
  document.body.appendChild(highlightOverlay);
}

// 2. 画面左下コントローラーの生成（シンプルなフラットデザイン）
function createControlPanel() {
  if (document.getElementById('tango-controller-panel')) return;
  
  controllerPanel = document.createElement('div');
  controllerPanel.id = "tango-controller-panel";
  controllerPanel.style.cssText = `
    position: fixed; bottom: 20px; left: 20px; z-index: 2147483647;
    background: #0f172a; color: white; padding: 6px 10px;
    border-radius: 8px; display: flex; gap: 6px; align-items: center;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15); font-family: system-ui, -apple-system, sans-serif;
    user-select: none; border: 1px solid #334155;
  `;
  
  // ★ツール名「Step Recorder」と各ボタン（✓ ⏸ 🗑）のデザイン
  controllerPanel.innerHTML = `
    <span style="font-size:11px; font-weight:600; margin-right:6px; color:#94a3b8;">Step Recorder</span>
    <button id="tango-done" style="background:#22c55e; border:none; color:white; border-radius:4px; width:26px; height:26px; font-size:12px; font-weight:bold; cursor:pointer; display:flex; align-items:center; justify-content:center;" title="完了">✓</button>
    <button id="tango-pause" style="background:#334155; border:none; color:white; border-radius:4px; width:26px; height:26px; font-size:11px; font-weight:bold; cursor:pointer; display:flex; align-items:center; justify-content:center;" title="一時停止">⏸</button>
    <button id="tango-cancel" style="background:#ef4444; border:none; color:white; border-radius:4px; width:26px; height:26px; font-size:12px; font-weight:bold; cursor:pointer; display:flex; align-items:center; justify-content:center;" title="破棄">🗑</button>
  `;
  document.body.appendChild(controllerPanel);

  // イベント登録
  document.getElementById('tango-done').addEventListener('click', finishWorkflow);
  document.getElementById('tango-pause').addEventListener('click', togglePause);
  document.getElementById('tango-cancel').addEventListener('click', cancelWorkflow);
}

// 3. マウスストーキング（追従）および入力の監視開始
function startTracking() {
  document.removeEventListener('mouseover', handleMouseOver, true);
  document.removeEventListener('click', handleCaptureClick, true);
  document.removeEventListener('blur', handleInputBlur, true);

  document.addEventListener('mouseover', handleMouseOver, true);
  document.addEventListener('click', handleCaptureClick, true);
  document.addEventListener('blur', handleInputBlur, true);
}

// マウスホバー時の赤枠追従
function handleMouseOver(e) {
  if (isPaused) return;
  if (!controllerPanel) return;
  
  if (controllerPanel.contains(e.target) || e.target === highlightOverlay) {
    highlightOverlay.style.display = 'none';
    return;
  }
  
  hoveredElement = e.target;
  const rect = hoveredElement.getBoundingClientRect();
  
  if (rect.width === 0 || rect.height === 0) return;

  highlightOverlay.style.width = `${rect.width + 4}px`;
  highlightOverlay.style.height = `${rect.height + 4}px`;
  highlightOverlay.style.left = `${rect.left + window.scrollX - 2}px`;
  highlightOverlay.style.top = `${rect.top + window.scrollY - 2}px`;
  highlightOverlay.style.display = 'block';
}

// 4. クリックされた瞬間のキャプチャとドキュメント化
async function handleCaptureClick(e) {
  if (isPaused) return;
  if (!controllerPanel) return;
  if (controllerPanel.contains(e.target)) return; 
  if (e.target.tagName === 'INPUT' && e.target.type === 'password') return;

  document.removeEventListener('click', handleCaptureClick, true);

  const targetText = e.target.innerText ? `「${e.target.innerText.trim().substring(0, 20)}」` : '';
  const targetId = e.target.id ? `#${e.target.id}` : '';
  const description = `${e.target.tagName.toLowerCase()}${targetId}要素 ${targetText} をクリックしました。`;

  chrome.runtime.sendMessage({ action: "captureTab" }, (response) => {
    chrome.storage.local.get(['steps'], (result) => {
      const currentSteps = result.steps || [];
      currentSteps.push({
        type: "クリック操作",
        url: window.location.href,
        details: description,
        timestamp: new Date().toLocaleTimeString(),
        screenshot: response ? response.screenshot : null
      });
      chrome.storage.local.set({ steps: currentSteps }, () => {
        document.addEventListener('click', handleCaptureClick, true);
      });
    });
  });
}

// 5. 入力フォームの自動記録
function handleInputBlur(e) {
  if (isPaused) return;
  if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') return;
  if (e.target.type === 'password') return; 
  if (!e.target.value.trim()) return;

  const targetId = e.target.id ? `#${e.target.id}` : '';
  const description = `${e.target.tagName.toLowerCase()}${targetId} に「${e.target.value.trim()}」と入力しました。`;

  chrome.storage.local.get(['steps'], (result) => {
    const currentSteps = result.steps || [];
    currentSteps.push({
      type: "テキスト入力",
      url: window.location.href,
      details: description,
      timestamp: new Date().toLocaleTimeString(),
      screenshot: null
    });
    chrome.storage.local.set({ steps: currentSteps });
  });
}

// 一時停止/再開の切り替え
function togglePause() {
  isPaused = !isPaused;
  const btn = document.getElementById('tango-pause');
  if (isPaused) {
    btn.textContent = "▶";
    btn.style.background = "#22c55e";
    if (highlightOverlay) highlightOverlay.style.display = 'none';
  } else {
    btn.textContent = "⏸";
    btn.style.background = "#334155";
  }
}

// ワークフローの破棄
function cancelWorkflow() {
  cleanup();
  chrome.storage.local.set({ steps: [], isRecording: false });
}

// 6. ワークフローの完了とレポート出力
function finishWorkflow() {
  cleanup();
  chrome.storage.local.set({ isRecording: false }, () => {
    chrome.storage.local.get(['steps'], (result) => {
      const htmlContent = generateTangoStyleReport(result.steps || []);
      const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      chrome.runtime.sendMessage({ action: "openReport", url: url });
    });
  });
}

function cleanup() {
  if (highlightOverlay) highlightOverlay.remove();
  if (controllerPanel) controllerPanel.remove();
  document.removeEventListener('mouseover', handleMouseOver, true);
  document.removeEventListener('click', handleCaptureClick, true);
  document.removeEventListener('blur', handleInputBlur, true);
}

// 手順書レポート出力用テンプレート
function generateTangoStyleReport(steps) {
  let rows = steps.map((step, idx) => `
    <div class="step-card">
      <div class="step-number">${idx + 1}</div>
      <div class="step-content">
        <div class="step-header">
          <span class="step-badge">${step.type}</span>
          <span class="step-time">${step.timestamp}</span>
        </div>
        <p class="step-details">${step.details}</p>
        <div class="url-bar">🔗 ${step.url}</div>
        ${step.screenshot ? `<div class="img-container"><img src="${step.screenshot}"></div>` : '<p style="color:#94a3b8; font-size:13px; font-style:italic; margin:0;">(入力内容をタイムラインに記録しました)</p>'}
      </div>
    </div>
  `).join('');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Step Recorder - 手順書レポート</title>
      <style>
        body { font-family: system-ui, -apple-system, sans-serif; background: #f8fafc; margin: 0; padding: 40px 20px; color: #1e293b; }
        .container { max-width: 760px; margin: 0 auto; }
        h1 { font-size: 28px; color: #0f172a; margin-bottom: 8px; }
        .meta { color: #64748b; font-size: 14px; margin-bottom: 40px; }
        .step-card { display: flex; gap: 20px; margin-bottom: 40px; position: relative; }
        .step-number { width: 32px; height: 32px; background: #4f46e5; color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 14px; flex-shrink: 0; }
        .step-content { background: white; border-radius: 12px; padding: 24px; flex-grow: 1; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); border: 1px solid #e2e8f0; }
        .step-header { display: flex; justify-content: space-between; margin-bottom: 12px; align-items: center; }
        .step-badge { background: #eef2ff; color: #4f46e5; font-size: 11px; font-weight: bold; padding: 4px 8px; border-radius: 4px; }
        .step-time { color: #94a3b8; font-size: 12px; }
        .step-details { font-size: 16px; font-weight: 500; margin: 0 0 8px 0; line-height: 1.5; }
        .url-bar { font-size: 12px; color: #64748b; background: #f1f5f9; padding: 4px 8px; border-radius: 6px; word-break: break-all; margin-bottom: 16px; }
        .img-container { width: 100%; border-radius: 8px; overflow: hidden; border: 1px solid #cbd5e1; }
        img { width: 100%; height: auto; display: block; }
        .actions { margin-bottom: 20px; display: flex; gap: 10px; }
        .btn { padding: 10px 16px; font-weight: bold; border-radius: 6px; border: none; cursor: pointer; font-size: 14px; }
        .btn-print { background: #0f172a; color: white; }
        @media print { .actions { display: none; } body { background: white; padding: 0; } .step-content { box-shadow: none; border: none; padding: 10px 0; } .step-card { page-break-inside: avoid; } }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="actions">
          <button class="btn btn-print" onclick="window.print()">PDFとして保存 / 印刷</button>
        </div>
        <h1>操作手順マニュアル</h1>
        <div class="meta">作成日時: ${new Date().toLocaleString()} | Step Recorder によって自動生成</div>
        ${rows}
      </div>
    </body>
    </html>
  `;
}