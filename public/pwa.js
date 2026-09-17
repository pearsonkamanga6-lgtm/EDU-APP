(() => {
  let deferredPrompt = null;
  const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

  function ensureStatus() {
    let wrap = document.getElementById('pwaTools');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'pwaTools';
      wrap.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:9999;display:flex;gap:8px;align-items:center;flex-wrap:wrap;max-width:calc(100vw - 24px)';
      document.body.appendChild(wrap);
    }
    return wrap;
  }

  function renderConnectivity() {
    const wrap = ensureStatus();
    let badge = document.getElementById('networkBadge');
    if (!badge) {
      badge = document.createElement('div');
      badge.id = 'networkBadge';
      badge.style.cssText = 'padding:7px 10px;border-radius:999px;font:700 11px system-ui;box-shadow:0 6px 20px #0002;border:1px solid #dbe3ef';
      wrap.appendChild(badge);
    }
    if (navigator.onLine) {
      badge.textContent = '● Online';
      badge.style.background = '#ecfdf3';
      badge.style.color = '#067647';
    } else {
      badge.textContent = '● Offline — live submissions paused';
      badge.style.background = '#fff4e5';
      badge.style.color = '#9a3412';
    }
  }

  function renderInstallButton() {
    const wrap = ensureStatus();
    let btn = document.getElementById('installEduSend');
    if (isStandalone()) {
      btn?.remove();
      return;
    }
    if (!deferredPrompt) return;
    if (!btn) {
      btn = document.createElement('button');
      btn.id = 'installEduSend';
      btn.type = 'button';
      btn.textContent = 'Install EduSend';
      btn.style.cssText = 'border:0;background:#0b2f6b;color:#fff;padding:9px 13px;border-radius:999px;font:700 12px system-ui;box-shadow:0 8px 24px #0003';
      btn.addEventListener('click', async () => {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        await deferredPrompt.userChoice.catch(() => null);
        deferredPrompt = null;
        renderInstallButton();
      });
      wrap.appendChild(btn);
    }
  }

  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPrompt = e;
    renderInstallButton();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    document.getElementById('installEduSend')?.remove();
  });
  window.addEventListener('online', renderConnectivity);
  window.addEventListener('offline', renderConnectivity);

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('/service-worker.js').catch(err => console.warn('Service worker registration failed', err)));
  }
  renderConnectivity();
})();
