// グローバル変数の定義（ローカル変数を明示し、window と同期）
let highlightOverlay = window.highlightOverlay || null;
let controllerPanel = window.controllerPanel || null;
let hoveredElement = window.hoveredElement || null;
let isPaused = window.isPaused || false;

// 安全に現在の URL を取得（クロスオリジン等でアクセスが拒否される場合に備える）
function safeGetLocation() {
  try {
    if (window && window.location && typeof window.location.href === 'string') {
      return window.location.href;
    }
  } catch (err) { /* ignore */ }
  try {
    if (document && document.location && typeof document.location.href === 'string') {
      return document.location.href;
    }
  } catch (err) { /* ignore */ }
  return '';
}

// HTML を安全にエスケープ（レポート埋め込み用）
function escapeHTML(s) {
  return String(s || '').replace(/[&<>"']/g, function (m) {
    return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]);
  });
}

// blob: または遠隔 URL を data:URL に変換する（失敗したら null を返す）
async function urlToDataURL(url) {
  if (!url) return null;
  // 既に data: ならそのまま
  if (url.startsWith('data:')) return url;
  try {
    // fetch して Blob を取得（同一コンテキストでアクセスできる場合）
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const blob = await resp.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => { reader.abort(); reject(new Error('FileReader error')); };
      reader.onload = () => { resolve(reader.result); };
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    // fetch が失敗（CORS、異なるオリジンの blob:、など）
    console.warn('urlToDataURL failed', err);
    return null;
  }
}

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
  window.isPaused = isPaused;
};

// 敏感入力かどうかを判定（マスク/記録除外ルール）
function isSensitiveInput(el) {
  if (!el || (!el.name && !el.id && !el.type && !el.placeholder)) return false;
  const lower = ((el.name || '') + ' ' + (el.id || '') + ' ' + (el.placeholder || '')).toLowerCase();
  const sensitiveKeywords = ['password', 'pass', 'card', 'cc', 'credit', 'cvv', 'ssn', 'social', 'dob', 'birth', 'pin'];
  if (sensitiveKeywords.some(k => lower.includes(k))) return true;
  const sensitiveTypes = ['password', 'tel'];
  if (sensitiveTypes.includes((el.type || '').toLowerCase())) return true;
  return false;
}

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
  window.highlightOverlay = highlightOverlay;
}

// 2. 画面左下コントローラーの生成（innerHTML を使わず安全に要素を作成）
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
  
  const title = document.createElement('span');
  title.textContent = 'Step Recorder';
  title.style.cssText = 'font-size:11px; font-weight:600; margin-right:6px; color:#94a3b8;';
  controllerPanel.appendChild(title);

  const btnDone = document.createElement('button');
  btnDone.id = 'tango-done';
  btnDone.title = '完了';
  btnDone.textContent = '✓';
  btnDone.style.cssText = 'background:#22c55e; border:none; color:white; border-radius:4px; width:32px; height:32px; font-size:14px; font-weight:bold; cursor:pointer; display:flex; align-items:center; justify-content:center;';

  const btnPause = document.createElement('button');
  btnPause.id = 'tango-pause';
  btnPause.title = '一時停止';
  btnPause.setAttribute('aria-pressed', String(isPaused));
  btnPause.textContent = isPaused ? '▶' : '⏸';
  btnPause.style.cssText = `background:${isPaused ? '#22c55e' : '#334155'}; border:none; color:white; border-radius:4px; width:32px; height:32px; font-size:14px; font-weight:bold; cursor:pointer; display:flex; align-items:center; justify-content:center;`;

  const btnCancel = document.createElement('button');
  btnCancel.id = 'tango-cancel';
  btnCancel.title = '破棄';
  btnCancel.textContent = '🗑';
  btnCancel.style.cssText = 'background:#ef4444; border:none; color:white; border-radius:4px; width:32px; height:32px; font-size:14px; font-weight:bold; cursor:pointer; display:flex; align-items:center; justify-content:center;';

  controllerPanel.appendChild(btnDone);
  controllerPanel.appendChild(btnPause);
  controllerPanel.appendChild(btnCancel);

  document.body.appendChild(controllerPanel);
  window.controllerPanel = controllerPanel;

  // イベント登録
  btnDone.addEventListener('click', finishWorkflow);
  btnPause.addEventListener('click', togglePause);
  btnCancel.addEventListener('click', cancelWorkflow);
}

// 3. マウスストーキング（追従）および入力の監視開始
function startTracking() {
  document.removeEventListener('mouseover', handleMouseOver, true);
  document.removeEventListener('click', handleCaptureClick, true);
  document.removeEventListener('focusout', handleInputBlur, true);

  document.addEventListener('mouseover', handleMouseOver, true);
  document.addEventListener('click', handleCaptureClick, true);
  document.addEventListener('focusout', handleInputBlur, true);
}

// マウスホバー時の赤枠追従
function handleMouseOver(e) {
  try {
    if (isPaused) return;
    if (!controllerPanel) return;
    if (!highlightOverlay) return;
    
    if (controllerPanel.contains(e.target) || e.target === highlightOverlay) {
      highlightOverlay.style.display = 'none';
      return;
    }
    
    hoveredElement = e.target;
    const rect = hoveredElement.getBoundingClientRect();
    
    if (rect.width === 0 || rect.height === 0) {
      highlightOverlay.style.display = 'none';
      return;
    }

    highlightOverlay.style.width = `${rect.width + 4}px`;
    highlightOverlay.style.height = `${rect.height + 4}px`;
    highlightOverlay.style.left = `${rect.left + window.scrollX - 2}px`;
    highlightOverlay.style.top = `${rect.top + window.scrollY - 2}px`;
    highlightOverlay.style.display = 'block';
  } catch (err) {
    console.warn('handleMouseOver error', err);
    if (highlightOverlay) highlightOverlay.style.display = 'none';
  }
}

// クリックされた瞬間のキャプチャとドキュメント化
async function handleCaptureClick(e) {
  if (isPaused) return;
  if (!controllerPanel) return;
  if (controllerPanel.contains(e.target)) return; 

  try {
    if (e.target.tagName === 'INPUT' && (e.target.type || '').toLowerCase() === 'password') return;
  } catch (err) { /* ignore */ }

  // 一時的にリスナーを外す（復帰は必ず行う）
  document.removeEventListener('click', handleCaptureClick, true);

  const el = e.target;
  const textContent = (el && (el.innerText || el.textContent) ? (el.innerText || el.textContent) : '').trim();
  const targetText = textContent ? `「${textContent.substring(0, 20)}」` : '';
  const targetId = (el && el.id) ? `#${el.id}` : '';
  const description = `${el && el.tagName ? el.tagName.toLowerCase() : 'element'}${targetId} 要素 ${targetText} をクリックしました。`;
  const url = safeGetLocation();

  try {
    chrome.runtime.sendMessage({ action: "captureTab" }, async (response) => {
      if (chrome.runtime.lastError) {
        console.warn('captureTab error:', chrome.runtime.lastError);
      }
      let screenshot = response && response.screenshot ? response.screenshot : null;

      // screenshot を data:URL に変換（可能なら）
      if (screenshot && !screenshot.startsWith('data:')) {
        const converted = await urlToDataURL(screenshot);
        if (converted) screenshot = converted;
        else screenshot = null;
      }

      chrome.storage.local.get(['steps'], (result) => {
        const currentSteps = result.steps || [];
        currentSteps.push({
          type: "クリック操作",
          url: url,
          details: description,
          timestamp: new Date().toLocaleTimeString(),
          screenshot: screenshot // data:URL または null
        });
        chrome.storage.local.set({ steps: currentSteps }, () => {
          try { document.addEventListener('click', handleCaptureClick, true); } catch (err) { console.warn('re-add click failed', err); }
        });
      });
    });
  } catch (err) {
    console.error('handleCaptureClick failed', err);
    try { document.addEventListener('click', handleCaptureClick, true); } catch (e) { /* ignore */ }
  }
}

// 5. 入力フォームの自動記録（focusout を使用）
function handleInputBlur(e) {
  if (isPaused) return;
  const el = e.target;
  if (!el) return;
  if (el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA' && !el.isContentEditable) return;
  try {
    if ((el.type || '').toLowerCase() === 'password') return; 
  } catch (err) { /* ignore */ }

  const value = (el.value || (el.isContentEditable ? el.innerText : '') || '').toString().trim();
  if (!value) return;

  let recordedValue = value;
  if (isSensitiveInput(el)) {
    recordedValue = '（敏感情報のためマスクされました）';
  }

  const targetId = el.id ? `#${el.id}` : '';
  const description = `${el.tagName.toLowerCase()}${targetId} に「${recordedValue}」と入力しました。`;
  const url = safeGetLocation();

  try {
    chrome.storage.local.get(['steps'], (result) => {
      const currentSteps = result.steps || [];
      currentSteps.push({
        type: "テキスト入力",
        url: url,
        details: description,
        timestamp: new Date().toLocaleTimeString(),
        screenshot: null
      });
      chrome.storage.local.set({ steps: currentSteps });
    });
  } catch (err) {
    console.error('handleInputBlur failed', err);
  }
}

// 一時停止/再開の切り替え
function togglePause() {
  isPaused = !isPaused;
  const btn = document.getElementById('tango-pause');
  if (!btn) return;
  btn.setAttribute('aria-pressed', String(isPaused));
  if (isPaused) {
    btn.textContent = "▶";
    btn.style.background = "#22c55e";
    if (highlightOverlay) highlightOverlay.style.display = 'none';
  } else {
    btn.textContent = "⏸";
    btn.style.background = "#334155";
  }
  window.isPaused = isPaused;
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
      try {
        chrome.runtime.sendMessage({ action: "openReport", url: url });
      } catch (err) {
        console.warn('openReport sendMessage failed', err);
        try { window.open(url, '_blank'); } catch (e) { /* ignore */ }
      }
    });
  });
}

function cleanup() {
  if (highlightOverlay) {
    try { highlightOverlay.remove(); } catch (e) { /* ignore */ }
  }
  if (controllerPanel) {
    try { controllerPanel.remove(); } catch (e) { /* ignore */ }
  }
  document.removeEventListener('mouseover', handleMouseOver, true);
  document.removeEventListener('click', handleCaptureClick, true);
  document.removeEventListener('focusout', handleInputBlur, true);
  // window との同期を解除
  window.highlightOverlay = null;
  window.controllerPanel = null;
  window.hoveredElement = null;
  window.isPaused = isPaused;
}

// 手順書レポート出力用テンプレート（編集機能付き）
function generateTangoStyleReport(steps) {
  // 安全に HTML を作るために escapeHTML を使う（URL/詳細はエスケープ）
  const rows = (steps || []).map((step, idx) => {
    const type = escapeHTML(step.type || '操作');
    const time = escapeHTML(step.timestamp || '');
    const details = escapeHTML(step.details || '');
    const url = escapeHTML(step.url || '');
    const screenshot = step.screenshot || null;

    const screenshotHtml = screenshot
      ? `<a class="screenshot-link" href="${screenshot}" target="_blank" rel="noopener noreferrer" title="フルサイズで開く">
           <div class="img-container"><img src="${screenshot}" alt="screenshot"></div>
         </a>`
      : `<p class="no-screenshot" style="color:#94a3b8; font-size:13px; font-style:italic; margin:0;">(スクリーンショットはありません)</p>`;

    return `
      <div class="step-card" data-step-index="${idx}">
        <div class="step-number">${idx + 1}</div>
        <div class="step-content">
          <div class="step-header">
            <span class="step-badge">${type}</span>
            <span class="step-time">${time}</span>
          </div>
          <p class="step-details" data-original="${details}">${details}</p>
          <div class="url-bar">🔗 ${url}</div>
          ${screenshotHtml}
        </div>
      </div>
    `;
  }).join('');

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
        .meta { color: #64748b; font-size: 14px; margin-bottom: 20px; }
        .step-card { display: flex; gap: 20px; margin-bottom: 40px; position: relative; }
        .step-number { width: 40px; min-width:40px; height: 40px; background: #4f46e5; color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 16px; }
        .step-content { background: white; border-radius: 12px; padding: 20px; flex-grow: 1; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); border: 1px solid #e2e8f0; position: relative; }
        .step-header { display: flex; justify-content: space-between; margin-bottom: 12px; align-items: center; }
        .step-badge { background: #eef2ff; color: #4f46e5; font-size: 11px; font-weight: bold; padding: 4px 8px; border-radius: 4px; }
        .step-time { color: #94a3b8; font-size: 12px; }
        .step-details { font-size: 16px; font-weight: 500; margin: 0 0 8px 0; line-height: 1.5; white-space: pre-wrap; }
        .url-bar { font-size: 12px; color: #64748b; background: #f1f5f9; padding: 6px 8px; border-radius: 6px; word-break: break-all; margin-bottom: 12px; }
        .img-container { width: 100%; max-height: 320px; border-radius: 8px; overflow: hidden; border: 1px solid #cbd5e1; display:flex; align-items:center; justify-content:center; background:#ffffff; }
        .img-container img { width: 100%; height: auto; display: block; object-fit:contain; }
        .actions { margin-bottom: 20px; display: flex; gap: 10px; }
        .btn { padding: 10px 16px; font-weight: bold; border-radius: 6px; border: none; cursor: pointer; font-size: 14px; }
        .btn-print { background: #0f172a; color: white; }
        .btn-export { background: #4f46e5; color: white; }
        .step-controls { position: absolute; top: 12px; right: 12px; display:flex; gap:8px; }
        .ctrl-btn { background: #eef2ff; border: 1px solid #e6e9ef; color: #334155; padding:6px 8px; border-radius:6px; font-size:12px; cursor:pointer; }
        .ctrl-btn.danger { background:#fee2e2; border-color:#fca5a5; color:#7f1d1d; }
        .editable { outline: 2px dashed rgba(79,70,229,0.25); padding: 4px; border-radius:6px; }
        @media print { .actions { display: none; } body { background: white; padding: 0; } .step-content { box-shadow: none; border: none; padding: 10px 0; } .step-card { page-break-inside: avoid; } .img-container { max-height: none; } }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="actions">
          <button class="btn btn-print" onclick="window.print()">PDFとして保存 / 印刷</button>
          <button class="btn btn-export" id="exportBtn">編集結果をダウンロード</button>
        </div>
        <h1>操作手順マニュアル</h1>
        <div class="meta">作成日時: ${escapeHTML(new Date().toLocaleString())} | Step Recorder によって自動生成</div>
        ${rows}
      </div>

      <script>
        (function(){
          function makeBtn(text, className) {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'ctrl-btn ' + (className||'');
            b.textContent = text;
            return b;
          }

          function addControls() {
            document.querySelectorAll('.step-card').forEach(card => {
              const content = card.querySelector('.step-content');
              if (!content) return;
              const controls = document.createElement('div');
              controls.className = 'step-controls';

              const editBtn = makeBtn('編集', '');
              const delImgBtn = makeBtn('画像削除', 'danger');
              const restoreImgBtn = makeBtn('画像復元', '');
              restoreImgBtn.style.display = 'none';

              controls.appendChild(editBtn);
              controls.appendChild(delImgBtn);
              controls.appendChild(restoreImgBtn);
              content.appendChild(controls);

              const details = content.querySelector('.step-details');
              const imgContainer = content.querySelector('.img-container');

              let originalDetails = details ? details.innerText : '';
              let originalImgHTML = imgContainer ? imgContainer.outerHTML : null;

              editBtn.addEventListener('click', () => {
                if (!details) return;
                const isEditing = details.isContentEditable;
                if (!isEditing) {
                  details.contentEditable = 'true';
                  details.classList.add('editable');
                  editBtn.textContent = '保存';
                  // focus and move caret to end
                  details.focus();
                  const range = document.createRange();
                  range.selectNodeContents(details);
                  range.collapse(false);
                  const sel = window.getSelection();
                  sel.removeAllRanges();
                  sel.addRange(range);
                } else {
                  // save
                  details.contentEditable = 'false';
                  details.classList.remove('editable');
                  editBtn.textContent = '編集';
                  originalDetails = details.innerText;
                }
              });

              delImgBtn.addEventListener('click', () => {
                if (!imgContainer) return;
                originalImgHTML = imgContainer.outerHTML;
                imgContainer.remove();
                delImgBtn.style.display = 'none';
                restoreImgBtn.style.display = '';
              });

              restoreImgBtn.addEventListener('click', () => {
                if (!originalImgHTML) return;
                // insert restored HTML at url-bar's next sibling
                const urlBar = content.querySelector('.url-bar');
                const wrapper = document.createElement('div');
                wrapper.innerHTML = originalImgHTML;
                if (urlBar && urlBar.nextSibling) {
                  urlBar.parentNode.insertBefore(wrapper.firstChild, urlBar.nextSibling);
                } else if (content) {
                  content.appendChild(wrapper.firstChild);
                }
                delImgBtn.style.display = '';
                restoreImgBtn.style.display = 'none';
              });

            });
          }

          function exportHtml() {
            // produce full HTML from document
            const doctype = '<!DOCTYPE html>';
            const html = doctype + '\n' + document.documentElement.outerHTML;
            const blob = new Blob([html], { type: 'text/html' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'step-report.html';
            document.body.appendChild(a);
            a.click();
            setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
          }

          document.addEventListener('DOMContentLoaded', () => {
            addControls();
            const exportBtn = document.getElementById('exportBtn');
            if (exportBtn) exportBtn.addEventListener('click', exportHtml);
          });
        })();
      </script>
    </body>
    </html>
  `;
}
