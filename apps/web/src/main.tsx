import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { Provider } from "./theme/provider.js";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Root element was not found.");
}

createRoot(root).render(
  <StrictMode>
    <Provider>
      <App />
    </Provider>
  </StrictMode>
);
