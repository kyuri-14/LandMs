# LandMs — Layout & Modules

LandMs（ランダムズ）は、Figma のように **レイアウト（L）** を組み、そこへ **Foling のモジュール（Ms）** を並べて Web サイトをつくる、AGPL のビジュアルエディターです。[Foling](https://github.com/kyuri-14/Foling) のビジュアル版として、同じ HTFL 形式で相互にやり取りできます。

- デスクトップ版（Tauri: Windows / macOS / Linux）と Web 版を、同じコードから提供します。
- 出力は **HTML / CSS / JavaScript** と **HTFL（Foling プロジェクト）** の両方に対応しています。

## しくみ

```
画面（Desktop / Tablet / Mobile …）  ← 表示条件（幅）で自動切り替え
└─ フレーム（ヘッダー・メイン・フッター…）  ← flex の並び方向・揃え・間隔・余白・サイズ
   ├─ フレーム …（入れ子にできる）
   └─ モジュール（ハンバーガー・カルーセル・ロゴ…）  ← 中身・リンク・動作を設定
```

1. **大きさを決める** — ヘッダーの高さ 80px、メインは「塗り（残りを使う）」など、Figma のオートレイアウトと同じ「塗り / 内容 / 固定」で指定します。
2. **並べ方を決める** — 各フレームで `flex-direction`（→ ↓ ← ↑）、主軸・交差軸の揃え、折り返し、間隔、余白を設定します。
3. **モジュールを置く** — 左のライブラリからキャンバスへドラッグ（クリックでも追加）。キャンバス上でもレイヤー上でもドラッグで並べ替えられます。
4. **モジュールを設定する** — 文言・リンク先・画像、項目の追加／削除（メニュー項目やスライドの数）、動作（自動再生の間隔、メニューの開く方向など）を右のパネルで編集します。

## 主な機能

- 実際の HTML を描画するキャンバス（モジュールの CSS・`vw`・`position: fixed` も書き出し結果どおりに表示）
- ドラッグ＆ドロップでの配置・移動、レイヤーツリー、コピー＆ペースト（画面をまたいで貼り付け可）、元に戻す／やり直し
- 標準モジュール 16 種（ロゴ、ナビ、ハンバーガー、SNS リンク、ヒーロー、見出し、テキスト、ボタン、カード、FAQ、カルーセル、画像、フォーム、コピーライト、スペーサー、区切り線）。すべて Foling のモジュール形式です
- **レスポンシブ**: 画面ごとに別レイアウトを持ち、`@media` の幅条件で表示を切り替え。条件の重なり・抜けは警告します
- **プレビュー**: モジュールのスクリプトを実際に動かして確認（幅を自由に変えて切り替わりを確認可能）。ブラウザでも開けます
- **コード**: HTML / CSS / JS / HTFL / Foling 出力をいつでも表示・コピー。選択中の要素の `config.yaml` も確認・モジュールの YAML を直接編集できます
- **書き出し**: HTML / CSS / JS 一式、1 ファイル HTML、HTFL プロジェクト、Foling モジュール YAML
- **Foling 連携**: Foling プロジェクトの `modules/` やモジュール YAML の読み込み、HTFL プロジェクトとしての書き出し
- **アップデート**（デスクトップ版）: 起動時と 6 時間ごとに確認し、OS 通知 → ワンクリックで更新・再起動（署名を検証）
- プロジェクトの保存（`.landms`）と自動保存

## ダウンロード

[Releases](https://github.com/kyuri-14/LandMs/releases) から OS ごとのインストーラーを入手できます（Windows は `LandMs_x.y.z_x64-setup.exe`）。
※ まだコード署名をしていないため、初回起動時に Windows SmartScreen / macOS Gatekeeper の警告が出ます。

## 開発

必要なもの: Node.js 20.19 以降、Rust（stable）、各 OS の [Tauri 2 の前提ソフト](https://tauri.app/start/prerequisites/)（Windows は WebView2）。

```bash
npm install
npm run tauri:dev      # デスクトップ版を起動
npm run dev            # Web 版（http://localhost:1420/）
```

```bash
npm run tauri:build    # インストーラーを作成（src-tauri/target/release/bundle/）
npm run build          # Web 版を dist/ に出力（静的ファイルなのでどこにでも置けます）
npm test               # 単体テスト
```

Foling 本体のビルド結果との一致テスト（`tests/foling-parity.test.ts`）は、Foling の `foling-mcp` を指定すると実行されます。

```bash
FOLING_MCP=/path/to/foling-mcp npm test
```

### フォルダー構成

| パス | 内容 |
|---|---|
| `src/core/` | データモデル、標準モジュール、HTFL / Web エンコーダー（UI に依存しない） |
| `src/core/htfl.ts` | プロジェクト → HTFL ツリー、HTFL フォルダー出力、Foling のビルド処理（`htfl/build.rs`）の移植 |
| `src/core/web.ts` | HTML / CSS / JS 出力 |
| `src/editor/` | キャンバス、レイヤー、インスペクター、ダイアログ |
| `src/platform/` | デスクトップ版と Web 版の差分（ファイル操作、プレビュー、更新） |
| `src-tauri/` | Tauri（Rust）側：ファイル入出力、プレビュー用ローカルサーバー |

## HTFL / Foling との対応

- 画面は `HTML/02_body/NN_div`（`class: lm-screen`, `data-screen`）、フレームは `NN_header` / `NN_main` などのフォルダー、レイアウトは各 `config.yaml` の `css:` になります。
- 標準モジュールの CSS は `classes/` に、使用したモジュール定義は `modules/landms.yaml` に書き出されます。
- 画面の切り替えは `classes/00_landms-base.css` のメディアクエリで行うため、Foling でもスクリプトなしで動作します。
- 既知の差異: Foling は `<body>` 内の `id` を行番号に置き換えるため、フレームに付けたアンカー（`#contact` など）は Foling でビルドした HTML では効きません。LandMs の HTML / CSS / JS 書き出しでは有効です。

## アップデートの公開

### 初回だけ: 署名鍵を登録する

GitHub リポジトリの **Settings → Secrets and variables → Actions → New repository secret** で次を登録します。

| 名前 | 値 |
|---|---|
| `TAURI_SIGNING_PRIVATE_KEY` | 更新署名用の秘密鍵ファイル（`.key`）の中身 |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | その鍵のパスワード（パスワードなしの鍵なら登録不要） |

`src-tauri/tauri.conf.json` の `plugins.updater.pubkey` には LandMs 専用の公開鍵（鍵 ID `3D1E14BDC0A49150`）が入っています。対になる秘密鍵 `landms.key` の中身を登録してください。PowerShell なら次の 1 行で秘密鍵がクリップボードにコピーされます（末尾の改行や空白はリリース時に自動で取り除きます）。

```bash
Get-Content "$HOME\.tauri\landms.key" | Set-Clipboard
```

鍵を作り直す場合は `npx @tauri-apps/cli signer generate -w "$HOME\.tauri\landms.key"` で作成し、`landms.key.pub` の中身で `pubkey` を置き換えます。秘密鍵とパスワードは失うと以後の版を自動更新できなくなるので、安全な場所に保管してください（秘密鍵は絶対にコミットしないでください）。

### リリースのたびに

```bash
npm run version:set -- 0.3.1     # package.json / tauri.conf.json / Cargo.toml をまとめて更新
git commit -am "Release v0.3.1"
git tag v0.3.1
git push origin main v0.3.1
```

タグを push すると `.github/workflows/release.yml` が各 OS のインストーラー、署名、`latest.json` を含む**下書きリリース**を作成します。GitHub の Releases で下書きを **Publish** すると、インストール済みの LandMs に更新通知が届きます。

タグを使わずに **Actions → Release → Run workflow**（Branch: `main`）から実行しても、バージョン番号のタグと下書きリリースが作られます。

### うまくいかないとき

ビルドの前に `preflight` ジョブが秘密鍵で実際に署名を試し、問題があれば数十秒で止まって原因を表示します。

| 表示 | 直し方 |
|---|---|
| contains the variable name | Secret の値に `TAURI_SIGNING_PRIVATE_KEY=` などの名前まで入っています。`.key` ファイルの中身（`dW50cnVzdGVk…` で始まる文字列）だけにしてください |
| holds the PUBLIC key | 公開鍵（`.key.pub`）が入っています。`.key` の方を登録してください |
| password is wrong | `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` を鍵のパスワードにしてください（パスワードなしの鍵なら削除） |
| does not match the updater public key | 鍵が `tauri.conf.json` の公開鍵と対になっていません。このまま公開すると、インストール済みのアプリが更新を拒否します |

Secret を直したら、失敗した実行の **Re-run all jobs** で再実行できます。

## ライセンス

[GNU Affero General Public License v3.0 or later](LICENSE)（AGPL-3.0-or-later）。
改変版をネットワーク越しに提供する場合も、利用者に対応するソースコードを提供する必要があります（AGPL 第 13 条）。アプリの「設定」にソースコードへのリンクがあります。
