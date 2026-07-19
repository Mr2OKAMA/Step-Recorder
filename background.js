// Content Script（content.js）からのメッセージ要求を待機
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  
  // 1. スクリーンショット撮影リクエストの処理
  if (message.action === "captureTab") {
    // 拡張機能のAPIを利用して、現在見えている範囲をキャプチャ（画質60%で容量を最適化）
    chrome.tabs.captureVisibleTab(null, { format: 'jpeg', quality: 60 }, (dataUrl) => {
      // 撮影した画像をデータURL形式（base64）でcontent.jsに返却
      sendResponse({ screenshot: dataUrl });
    });
    return true; // 非同期処理（sendResponse）を維持するために必須
  }
  
  // 2. レポート出力画面（新タブ）を立ち上げる処理
  if (message.action === "openReport" && message.url) {
    chrome.tabs.create({ url: message.url });
    return true;
  }
});