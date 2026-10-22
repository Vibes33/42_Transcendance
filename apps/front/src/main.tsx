import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./api/queries";
import { App } from "./App";
import "./styles.css";

// Mode sombre par défaut avant le premier rendu (évite un flash clair)
let saved: string | null = null;
try {
  saved = localStorage.getItem("loltr:mode");
} catch {}
document.documentElement.classList.add(saved === "light" ? "light" : "dark");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>
);
