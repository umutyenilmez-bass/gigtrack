import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

const target = document.getElementById("cfos-app-root") || document.getElementById("root");
if (target) {
  createRoot(target).render(<App />);
}
