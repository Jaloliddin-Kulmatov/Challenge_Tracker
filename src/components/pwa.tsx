"use client";
import { Download, Share, SquarePlus, X } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";

// ---------------------------------------------------------------------------
// Install state: the browser's "install" prompt arrives once, early, so one small store keeps it for everyone.
// ---------------------------------------------------------------------------
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}
type Snapshot = { prompt: InstallPromptEvent | null; installed: boolean };

let state: Snapshot = { prompt: null, installed: false };
const listeners = new Set<() => void>();
const set = (next: Partial<Snapshot>) => {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
};
let started = false;
function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // keep it so our own button can show it
    set({ prompt: e as InstallPromptEvent });
  });
  window.addEventListener("appinstalled", () => set({ prompt: null, installed: true }));
}
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => void listeners.delete(cb);
};
const getSnapshot = () => state;
const getServerSnapshot = (): Snapshot => ({ prompt: null, installed: false });

export type Platform = "installed" | "prompt" | "ios" | "other";

/** What the person can do right now to put the app on their home screen. */
export function useInstall(): { platform: Platform; install: () => Promise<boolean> } {
  const snap = React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [env, setEnv] = React.useState<{ standalone: boolean; ios: boolean } | null>(null);
  React.useEffect(() => {
    start();
    const nav = navigator as Navigator & { standalone?: boolean };
    const ua = navigator.userAgent;
    setEnv({
      standalone: window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true,
      // iPadOS pretends to be a Mac; touch points give it away
      ios: /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1),
    });
  }, []);

  const platform: Platform = snap.installed || env?.standalone ? "installed" : snap.prompt ? "prompt" : env?.ios ? "ios" : "other";
  const install = React.useCallback(async () => {
    const p = state.prompt;
    if (!p) return false;
    await p.prompt();
    const { outcome } = await p.userChoice;
    set({ prompt: null }); // a prompt can only be used once
    return outcome === "accepted";
  }, []);
  return { platform, install };
}

/** Registers the service worker (production only: it would get in the way of hot reloading). */
export function RegisterServiceWorker() {
  React.useEffect(() => {
    start();
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      /* the app works without it; it just isn't installable on browsers that need one */
    });
  }, []);
  return null;
}

const DISMISS_KEY = "install-banner-dismissed";
const readDismissed = () => {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
};

function IosSteps() {
  return (
    <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted">
      <li>Open this page in <strong>Safari</strong>.</li>
      <li>Tap <Share className="inline size-4 align-text-bottom" aria-label="Share" /> <strong>Share</strong> at the bottom of the screen.</li>
      <li>Scroll down and tap <SquarePlus className="inline size-4 align-text-bottom" aria-hidden /> <strong>Add to Home Screen</strong>, then <strong>Add</strong>.</li>
    </ol>
  );
}

/** A slim, dismissible nudge at the top of the app – only where installing is actually possible. */
export function InstallBanner() {
  const { platform, install } = useInstall();
  const [dismissed, setDismissed] = React.useState(true); // hidden until we've read the stored choice
  const [showIos, setShowIos] = React.useState(false);
  React.useEffect(() => setDismissed(readDismissed()), []);

  if (dismissed || (platform !== "prompt" && platform !== "ios")) return null;
  const close = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* private mode: it just comes back next time */
    }
  };
  return (
    <div role="region" aria-label="Install the app" className="mb-4 rounded-2xl border border-primary/30 bg-primary/10 p-3">
      <div className="flex items-center gap-3">
        <Download className="size-5 shrink-0 text-primary" aria-hidden />
        <p className="min-w-0 flex-1 text-sm font-medium">Add this app to your home screen for one-tap access.</p>
        {platform === "prompt" ? (
          <Button size="sm" onClick={async () => void ((await install()) && close())}>Install</Button>
        ) : (
          <Button size="sm" variant="secondary" onClick={() => setShowIos((v) => !v)} aria-expanded={showIos}>How</Button>
        )}
        <Button variant="ghost" size="icon" className="size-9" aria-label="Dismiss" onClick={close}><X className="size-4" /></Button>
      </div>
      {platform === "ios" && showIos && <div className="mt-3 border-t border-primary/20 pt-3"><IosSteps /></div>}
    </div>
  );
}

/** Settings card: the install button, or the right instructions for this device. */
export function InstallCard() {
  const { platform, install } = useInstall();
  const [busy, setBusy] = React.useState(false);
  return (
    <Card className="space-y-3">
      <CardTitle>Install on your phone</CardTitle>
      {platform === "installed" && <p className="text-sm text-muted">✓ You're using the installed app.</p>}
      {platform === "prompt" && (
        <>
          <p className="text-sm text-muted">Put the tracker on your home screen. It opens full screen, like an app.</p>
          <Button loading={busy} onClick={async () => { setBusy(true); try { await install(); } finally { setBusy(false); } }}>
            <Download className="size-4" aria-hidden /> Add to home screen
          </Button>
        </>
      )}
      {platform === "ios" && (
        <>
          <p className="text-sm text-muted">iPhone and iPad install from Safari:</p>
          <IosSteps />
        </>
      )}
      {platform === "other" && (
        <p className="text-sm text-muted">
          On Android (Chrome): open the ⋮ menu and choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.
          On iPhone: open this page in Safari, tap Share, then <strong>Add to Home Screen</strong>. On a computer, look for the install icon in the address bar.
        </p>
      )}
    </Card>
  );
}
