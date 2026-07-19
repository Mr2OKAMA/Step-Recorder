document.getElementById('startCapture').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  if (tab && !tab.url.startsWith('chrome') && !tab.url.startsWith('edge')) {
    // 状態を初期化して開始
    chrome.storage.local.set({ steps: [], isRecording: true }, async () => {
      
      // 【確実な方法に変更】メッセージ通信ではなく、関数を直接ターゲットタブに注入して実行
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          // content.js側で定義されている起動関数を直接叩く
          if (typeof initCaptureEnvironment === 'function') {
            initCaptureEnvironment();
          } else {
            alert("ページの読み込みが未完了か、拡張機能が正しくロードされていません。ページを再読み込みしてください。");
          }
        }
      });

      window.close(); // ポップアップを閉じる
    });
  } else {
    const msgDiv = document.getElementById('msg');
    if (msgDiv) {
      msgDiv.textContent = "⚠️ このページ（管理画面など）ではキャプチャを開始できません。";
      msgDiv.style.color = "#ef4444";
    }
  }
});