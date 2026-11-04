// SPDX-License-Identifier: AGPL-3.0-or-later
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import { createRoot } from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./ErrorBoundary";
import { isDesktop } from "./platform";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("LandMs root element was not found");

// macOS desktop: the window uses an overlay title bar, so leave room for the traffic lights.
if (isDesktop && /Mac/i.test(navigator.userAgent)) document.documentElement.dataset.platform = "macos";

// Prevent the webview from navigating away when a file is dropped outside the canvas.
window.addEventListener("dragover", (event) => event.preventDefault());
window.addEventListener("drop", (event) => event.preventDefault());

createRoot(root).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
