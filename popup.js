document.getElementById('startCapture').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  const msgDiv = document.getElementById('msg');
  try {
    // Log for debugging
    console.log('popup: target tab', tab && tab.id, tab && tab.url);

    if (!tab || !tab.url) {
      if (msgDiv) {
        msgDiv.textContent = '⚠️ タブの URL を取得できません。別のページを表示してから再試行してください。';
        msgDiv.style.color = '#ef4444';
      }
      return;
    }

    // Disallow special schemes where we cannot inject (chrome://, edge://, about:, file:, blob: etc.)
    if (!/^https?:\/\//i.test(tab.url)) {
      if (msgDiv) {
        msgDiv.textContent = '⚠️ このページにはキャプチャ/注入できません（chrome://、edge://、file://、blob: などは不可）。別の通常のページを開いてください。';
        msgDiv.style.color = '#ef4444';
      }
      return;
    }

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
              // initCaptureEnvironment が未定義の場合はユーザーに通知（console）
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
  } catch (err) {
    console.error('startCapture click handler error', err);
    if (msgDiv) {
      msgDiv.textContent = '予期しないエラーが発生しました。コンソールを確認してください。';
      msgDiv.style.color = '#ef4444';
    }
  }
});
