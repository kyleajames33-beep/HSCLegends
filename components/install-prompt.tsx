'use client';

import { useEffect, useState } from 'react';

type BIPEvent = Event & { prompt: () => void; userChoice: Promise<{ outcome: string }> };
const DISMISS_KEY = 'legends_install_dismissed';

// "Add to Home Screen" nudge. Android/Chrome uses the native prompt; iOS shows
// manual instructions (Safari has no install event). Dismissal is remembered.
export default function InstallPrompt() {
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [show, setShow] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(DISMISS_KEY)) return;
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (standalone) return;

    if (/iphone|ipad|ipod/i.test(navigator.userAgent)) {
      setIos(true);
      setShow(true);
      return;
    }
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BIPEvent);
      setShow(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  if (!show) return null;

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, '1');
    setShow(false);
  }
  async function install() {
    if (!deferred) return;
    deferred.prompt();
    await deferred.userChoice;
    dismiss();
  }

  return (
    <div className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-md rounded-2xl border border-zinc-700 bg-zinc-900/95 backdrop-blur px-4 py-3 shadow-xl">
      <div className="flex items-center gap-3">
        <span className="text-2xl">📲</span>
        <div className="flex-1 text-sm">
          {ios ? (
            <span className="text-zinc-300">
              Add Legends to your home screen: tap <strong>Share</strong> ⬆️ then{' '}
              <strong>Add to Home Screen</strong>.
            </span>
          ) : (
            <span className="text-zinc-300">Install Legends for one-tap access.</span>
          )}
        </div>
        {!ios && (
          <button onClick={install} className="rounded-lg bg-indigo-600 hover:bg-indigo-500 px-3 py-1.5 text-sm font-semibold">
            Install
          </button>
        )}
        <button onClick={dismiss} aria-label="Dismiss" className="text-zinc-500 px-1">
          ✕
        </button>
      </div>
    </div>
  );
}
