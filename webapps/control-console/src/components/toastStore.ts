export type ToastType = 'success' | 'error' | 'info' | 'warning';

const styles: Record<ToastType, { bg: string; border: string; icon: string; iconBg: string; label: string }> = {
  success: { bg: '#022c22', border: '#059669', icon: '✓', iconBg: '#059669', label: 'Success' },
  error:   { bg: '#2d1215', border: '#dc2626', icon: '✕', iconBg: '#dc2626', label: 'Error' },
  info:    { bg: '#0c2340', border: '#2563eb', icon: 'ℹ', iconBg: '#2563eb', label: 'Info' },
  warning: { bg: '#2d200c', border: '#d97706', icon: '⚠', iconBg: '#d97706', label: 'Warning' },
};

function ensureContainer() {
  let c = document.getElementById('__toasts');
  if (!c) {
    c = document.createElement('div');
    c.id = '__toasts';
    c.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:99999;display:flex;flex-direction:column;gap:10px;width:480px;max-width:calc(100vw - 32px);pointer-events:none';
    document.body.appendChild(c);
  }
  return c;
}

if (typeof document !== 'undefined' && !document.getElementById('__toast-keyframes')) {
  const s = document.createElement('style');
  s.id = '__toast-keyframes';
  s.textContent = `
    @keyframes toastSlideDown { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes toastSlideUp { from { opacity: 1; transform: translateY(0); } to { opacity: 0; transform: translateY(-10px); } }
  `;
  document.head.appendChild(s);
}

export function toast(type: ToastType, message: string) {
  const st = styles[type];
  const c = ensureContainer();

  const el = document.createElement('div');
  el.style.cssText = [
    `display:flex;align-items:flex-start;gap:12px`,
    `padding:14px 16px;border-radius:12px`,
    `background:${st.bg};border:1px solid ${st.border}`,
    `color:#e5e7eb;font-size:14px;line-height:1.5`,
    `box-shadow:0 4px 24px rgba(0,0,0,0.4)`,
    `animation:toastSlideDown 0.3s ease`,
    `pointer-events:auto;cursor:pointer`,
    `transition:opacity 0.2s`,
  ].join(';');

  el.innerHTML = [
    `<span style="display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:8px;background:${st.iconBg};color:#fff;font-size:15px;flex-shrink:0;font-weight:700">${st.icon}</span>`,
    `<div style="flex:1;min-width:0">`,
      `<div style="font-weight:600;font-size:13px;color:${st.border};margin-bottom:2px">${st.label}</div>`,
      `<div style="word-break:break-word">${message}</div>`,
    `</div>`,
    `<span style="color:#6b7280;font-size:16px;flex-shrink:0;line-height:1;padding-top:2px">×</span>`,
  ].join('');

  el.onclick = () => dismiss(el);

  c.appendChild(el);

  const dismiss = (el: HTMLElement) => {
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 200);
  };

  setTimeout(() => dismiss(el), 4000);
}
