import { useMemo } from "react";

const envValue = String(import.meta.env.VITE_DEMO_MODE || "").toLowerCase();
const envEnabled =
  envValue === "true" || envValue === "1" || envValue === "yes";

const queryEnabled = () => {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  const val = String(params.get("demo") || "").toLowerCase();
  return val === "true" || val === "1" || val === "yes";
};

export const getDemoMode = () => envEnabled || queryEnabled();

export function useDemoMode() {
  return useMemo(() => getDemoMode(), []);
}
