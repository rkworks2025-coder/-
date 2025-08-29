# 巡回アプリ 同期修正パッチ（フロント差し替え）
- `app.js`：同期処理を置き換え。`https://script.google.com/macros/s/AKfycbyLPjIJOmYeC7kyZikkWcY-CmWlHYwL2NJDD0GL78x8XEN5UkBRfLY9EeCPyPZD34_aVw/exec?action=pull` を叩き、非JSON応答時も内容を表示します。
- `sync_tester.html`：GAS の生レスポンス確認用。

## 使い方
1. リポジトリの `app.js` をこのファイルで **上書き**。
2. （任意）`sync_tester.html` を GitHub Pages で開き、レスポンスを確認。
3. 同期ボタンは `id="syncBtn"` を付けるか、`onclick="syncFromGas()"` をセット。
