import "./style.css";

import { createElement } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";

const root = document.querySelector("#root");
if (root === null) throw new Error("Popup root is missing");

createRoot(root).render(
  createElement(App, {
    openUrl: (url) => void browser.tabs.create({ url }),
    sendMessage: (message) => browser.runtime.sendMessage(message),
  })
);
