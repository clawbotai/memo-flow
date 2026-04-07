import "@fontsource/lora/400.css";
import "@fontsource/lora/500.css";
import "@fontsource/lora/600.css";
import "@fontsource/lora/700.css";
import "@/styles/globals.css";
import "@desktop/desktop.css";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "@desktop/App";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
