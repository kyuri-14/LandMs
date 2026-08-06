# LandMs — Layout & Modules

LandMs（ランダムズ）は、Figmaのように画面を見ながらレイアウトを組み、Folingのモジュールを配置してWebサイトを制作する、AGPLのビジュアルエディターです。Web版とTauriデスクトップ版を同じ編集コアから提供します。

## 機能

- Folingモジュールの追加、ドラッグ配置、並べ替え、複製、削除
- `flex-direction`、配置、サイズ、間隔、色、角丸、文言、リンクの編集
- Desktop / Tablet / Mobileごとの画面構成
- 編集内容とインポート済みモジュールの端末内保存
- HTML / CSS / JavaScript一式の書き出し
- Foling互換HTFLプロジェクトの書き出し
  - `htfl.yaml`
  - `HTML/`要素ツリー
  - 各要素の`config.yaml`
  - `classes/`、`images/`、`plugins/`
- FolingモジュールYAML（`.yaml` / `.yml`）の検証・インポート
- 署名付きデスクトップアップデートの確認、OS通知、ダウンロード、再起動

## Tauriデスクトップ版

Node.js 22.13以降、Rust stable、各OSのTauriビルド要件が必要です。

```bash
npm install
npm run tauri:dev
```

Windowsで実行ファイルだけを生成する場合：

```bash
npm run tauri:build -- --debug --no-bundle
```

生成先は`src-tauri/target/debug/landms.exe`です。インストーラーを含む正式ビルドは`npm run tauri:build`で生成できます。

## Web版

```bash
npm run dev
```

ブラウザで`http://localhost:3000/`を開きます。

## HTFLとFolingモジュール

HTFLはFolingの **HyperText Foldering Language** 仕様に従い、HTML DOMをフォルダー階層と`config.yaml`で表現します。LandMsのHTFLタブは内容確認用で、書き出し操作ではFolingがそのまま開けるフォルダー構造を生成します。

モジュールインポートはFolingのモジュール定義配列（`name`、`snapshot`、任意の`css`）を受け付けます。インポートしたモジュールは左側の「Imported」ライブラリから配置できます。

## アップデート公開

`.github/workflows/release.yml`が`v*`タグからWindows / macOS / Linux用リリースと`latest.json`を生成します。GitHubリポジトリに次のActions secretsを設定してください。

- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

Tauri設定の公開鍵はFolingと同じ署名鍵を使用する前提です。別の秘密鍵を使う場合は`src-tauri/tauri.conf.json`の`plugins.updater.pubkey`も対応する公開鍵に変更してください。

## ライセンス

GNU Affero General Public License v3.0 or later（`AGPL-3.0-or-later`）。ネットワーク越しに改変版を提供する場合も、利用者に対応するソースコードを提供する必要があります。
