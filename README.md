# LandMs — Layout & Modules

LandMs（ランダムズ）は、Figma のように画面を見ながらレイアウトを組み、Foling のモジュールを配置して Web サイトを制作するオープンソースのビジュアルエディターです。

## 現在の初期版

- Foling モジュールの追加とドラッグ配置
- キャンバス内モジュールの選択・並べ替え・複製・削除
- `flex-direction`、配置、サイズ、間隔、色、角丸、文言、リンクの編集
- Desktop / Tablet / Mobile ごとの画面構成
- 編集内容の端末内保存
- HTML / CSS / JavaScript コードの確認と自己完結 HTML の書き出し
- Foling 接続フローのモック UI
- 編集画面と Web プレビューの切り替え

## 開発

Node.js 22.13 以降を使用します。

```bash
npm install
npm run dev
```

## Foling 連携について

現時点では接続先仕様が提供されていないため、Foling 連携は UI とローカル同期のモックです。実接続には、モジュールスキーマ、プロジェクト API、認証方式、コード更新イベントの仕様が必要です。

## ライセンス

このプロジェクトは GNU Affero General Public License v3.0 or later（`AGPL-3.0-or-later`）で公開する前提です。ネットワーク越しに改変版を提供する場合も、利用者に対応するソースコードを提供する必要があります。
