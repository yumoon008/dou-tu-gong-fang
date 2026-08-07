import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import PatternStudio from "../app/PatternStudio";
import "../app/globals.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PatternStudio />
  </StrictMode>,
);
