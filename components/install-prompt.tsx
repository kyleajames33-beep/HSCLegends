'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';

type BIPEvent = Event & { prompt: () => void; userChoice: Promise<{ outcome: string }> };
const DISMISS_KEY = 'legends_install_dismissed';

function dismissed() {
  try { return localStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; }
}

function standalone() {
  return window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function iosInstallAvailable() {
  return !dismissed() && !standalone() && /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function subscribeStorage(notify: () => void) {
  window.addEventListener('storage', notify);
  return () => window.removeEventListener('storage', notify);
}

// "Add to Home Screen" nudge. Android/Chrome uses the native prompt; iOS shows
// manual instructions (Safari has no install event). Dismissal is remembered.
export default function InstallPrompt() {
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [closed, setClosed] = useState(false);
  const ios = useSyncExternalStore(subscribeStorage, iosInstallAvailable, () => false);

  useEffect(() => {
    const handler = (e: Event) => {
      if (dismissed() || standalone()) return;
      e.preventDefault();
      setDeferred(e as BIPEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  if (closed || (!ios && !deferred)) return null;

  function dismiss() {
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* Hide for this session when storage is unavailable. */ }
    setClosed(true);
    setDeferred(null);
  }
  async function install() {
    if (!deferred) return;
    deferred.prompt();
    await deferred.userChoice;
    dismiss();
  }

  return (
    <div className="lg-card fixed inset-x-3 bottom-3 z-50 mx-auto max-w-md px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="text-2xl">📲</span>
        <div className="flex-1 text-sm">
          {ios ? (
            <span className="text-inksoft">
              Add Legends to your home screen: tap <strong>Share</strong> ⬆️ then{' '}
              <strong>Add to Home Screen</strong>.
            </span>
          ) : (
            <span className="text-inksoft">Install Legends for one-tap access.</span>
          )}
        </div>
        {!ios && (
          <button onClick={install} className="lg-btn lg-btn-primary px-3 py-1.5 text-sm">
            Install
          </button>
        )}
        <button onClick={dismiss} aria-label="Dismiss" className="text-muted px-1">
          ✕
        </button>
      </div>
    </div>
  );
}
