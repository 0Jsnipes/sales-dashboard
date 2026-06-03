import { useEffect, useState } from "react";

function isIosDevice() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone;
}

export default function InstallAppBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [dismissed, setDismissed] = useState(false);
  const [showIosHint, setShowIosHint] = useState(false);

  useEffect(() => {
    if (isStandalone()) return undefined;

    const bannerDismissed = window.localStorage.getItem("install-banner-dismissed") === "true";
    if (bannerDismissed) {
      setDismissed(true);
      return undefined;
    }

    const handlePrompt = (event) => {
      event.preventDefault();
      setDeferredPrompt(event);
    };

    window.addEventListener("beforeinstallprompt", handlePrompt);
    setShowIosHint(isIosDevice());

    return () => window.removeEventListener("beforeinstallprompt", handlePrompt);
  }, []);

  if (dismissed || isStandalone() || (!deferredPrompt && !showIosHint)) {
    return null;
  }

  const dismiss = () => {
    window.localStorage.setItem("install-banner-dismissed", "true");
    setDismissed(true);
  };

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
  };

  return (
    <div className="sticky top-0 z-50 border-b border-black/10 bg-slate-950 text-white shadow-sm">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-3 py-3 sm:px-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold tracking-tight">Install AB Sales</p>
          <p className="text-xs text-slate-300">
            {deferredPrompt
              ? "Add this dashboard to your home screen for faster access."
              : 'On iPhone, tap Share and choose "Add to Home Screen".'}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {deferredPrompt ? (
            <button
              type="button"
              className="btn btn-sm border-0 bg-lime-300 text-slate-950 hover:bg-lime-200"
              onClick={handleInstall}
            >
              Install
            </button>
          ) : null}
          <button
            type="button"
            className="btn btn-ghost btn-sm text-white hover:bg-white/10"
            onClick={dismiss}
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
