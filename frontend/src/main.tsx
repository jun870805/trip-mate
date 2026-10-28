import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { installDialogScrollLock } from "./data/dialog-scroll";

const disposeDialogScrollLock = installDialogScrollLock(document, window);
if (import.meta.hot) import.meta.hot.dispose(disposeDialogScrollLock);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
