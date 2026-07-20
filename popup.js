document.getElementById('startCapture').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  const msgDiv = document.getElementById('msg');
  try {
    if (tab && tab.url && !tab.url.startsWith('chrome') && !tab.url.startsWith('edge')) {
      // 状態を初期化して開始
      chrome.storage.local.set({ steps: [], isRecording: true }, async () => {
        try {
          // 注入する関数をタブ上で実行（content script 側で定義された initCaptureEnvironment を呼ぶ）
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
              if (typeof initCaptureEnvironment === 'function') {
                initCaptureEnvironment();
              } else {
                // initCaptureEnvironment が未定義の場合はユーザーに通知
                // （注意: alert をページ内で出すのはうるさいので、ここでは console に出す）
                console.warn('initCaptureEnvironment not found in page context');
              }
            }
          });

          // 成功したらポップアップを閉じる
          window.close();
        } catch (err) {
          console.error('executeScript failed', err);
          if (msgDiv) {
            msgDiv.textContent = 'エラー: ページに操作パネルを注入できませんでした。ページを再読み込みしてから再試行してください。';
            msgDiv.style.color = '#ef4444';
          }
        }
      });
    } else {
      if (msgDiv) {
        msgDiv.textContent = "⚠️ このページ（管理画面など）ではキャプチャを開始できません。";
        msgDiv.style.color = "#ef4444";
      }
    }
  } catch (err) {
    console.error('startCapture click handler error', err);
    if (msgDiv) {
      msgDiv.textContent = '予期しないエラーが発生しました。コンソールを確認してください。';
      msgDiv.style.color = '#ef4444';
    }
  }
});
