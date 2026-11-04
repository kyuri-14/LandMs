// SPDX-License-Identifier: AGPL-3.0-or-later
// Shows the error instead of a blank window, with a way out of a broken autosave.

import { Component, type ReactNode } from "react";

type State = { error: Error | null };

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="crash">
        <h1>LandMs でエラーが発生しました</h1>
        <p>作業内容は自動保存されています。再読み込みで戻れない場合は、自動保存を消去して起動し直してください。</p>
        <pre>{error.stack ?? error.message}</pre>
        <div className="button-row">
          <button className="primary-button" onClick={() => window.location.reload()}>再読み込み</button>
          <button
            className="ghost-button"
            onClick={() => {
              const backup = window.localStorage.getItem("landms:autosave");
              if (backup) {
                const blob = new Blob([backup], { type: "application/json" });
                const anchor = document.createElement("a");
                anchor.href = URL.createObjectURL(blob);
                anchor.download = "landms-autosave-backup.landms";
                anchor.click();
              }
              window.localStorage.removeItem("landms:autosave");
              window.location.reload();
            }}
          >
            自動保存をバックアップして消去
          </button>
        </div>
      </div>
    );
  }
}
