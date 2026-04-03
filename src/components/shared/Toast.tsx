import { useEffect } from 'react';
import { Close } from '@carbon/icons-react';
import { useToastStore, type ToastMessage } from '@/stores/toast';
import './Toast.css';

const borderColors: Record<ToastMessage['kind'], string> = {
  info: 'var(--cds-support-info, #4589ff)',
  success: 'var(--cds-support-success, #42be65)',
  warning: 'var(--cds-support-warning, #f1c21b)',
  error: 'var(--cds-support-error, #ff8389)',
};

/** Toast notification container with auto-dismiss */
export default function Toast() {
  const messages = useToastStore((s) => s.messages);
  const removeToast = useToastStore((s) => s.removeToast);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (const msg of messages) {
      if (msg.duration && msg.duration > 0) {
        timers.push(setTimeout(() => removeToast(msg.id), msg.duration));
      }
    }
    return () => timers.forEach(clearTimeout);
  }, [messages, removeToast]);

  if (messages.length === 0) return null;

  return (
    <div className="toast-container" role="log" aria-live="polite">
      {messages.map((msg) => (
        <div
          key={msg.id}
          className="toast"
          style={{ borderLeftColor: borderColors[msg.kind] }}
        >
          <div className="toast-content">
            <span className="toast-title">{msg.title}</span>
            {msg.subtitle && (
              <span className="toast-subtitle">{msg.subtitle}</span>
            )}
          </div>
          <button
            className="toast-close"
            aria-label="Close notification"
            onClick={() => removeToast(msg.id)}
          >
            <Close size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
