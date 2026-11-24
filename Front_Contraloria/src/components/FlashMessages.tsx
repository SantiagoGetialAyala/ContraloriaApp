import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import type { FlashMessage } from './Layout';

const DEFAULT_DURATIONS_MS: Record<FlashMessage['type'], number> = {
  success: 2800,
  warning: 4000,
  error: 5500,
};

const EXIT_ANIMATION_MS = 180;

const MESSAGE_ICONS: Record<FlashMessage['type'], string> = {
  success: '✓',
  warning: '!',
  error: '×',
};

interface FlashMessageItemProps {
  message: FlashMessage;
  onDismiss: (id: number) => void;
}

function FlashMessageItem({ message, onDismiss }: FlashMessageItemProps) {
  const duration = DEFAULT_DURATIONS_MS[message.type];
  const [leaving, setLeaving] = useState(false);
  const [paused, setPaused] = useState(false);
  const remainingRef = useRef(duration);
  const startedAtRef = useRef(0);
  const dismissStartedRef = useRef(false);
  const exitTimerRef = useRef<number | null>(null);

  const triggerClose = useCallback(() => {
    if (dismissStartedRef.current) return;
    dismissStartedRef.current = true;
    setLeaving(true);
    exitTimerRef.current = window.setTimeout(() => {
      onDismiss(message.id);
    }, EXIT_ANIMATION_MS);
  }, [message.id, onDismiss]);

  useEffect(() => {
    return () => {
      if (exitTimerRef.current !== null) {
        window.clearTimeout(exitTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (paused || leaving) return;
    startedAtRef.current = Date.now();
    const timer = window.setTimeout(() => {
      triggerClose();
    }, Math.max(0, remainingRef.current));
    return () => {
      window.clearTimeout(timer);
      const elapsed = Date.now() - startedAtRef.current;
      remainingRef.current = Math.max(0, remainingRef.current - elapsed);
    };
  }, [paused, leaving, triggerClose]);

  const variantClass =
    message.type === 'error' ? 'error' : message.type === 'warning' ? 'warning' : '';

  return (
    <div
      className={`message ${variantClass}${leaving ? ' is-leaving' : ''}${paused ? ' is-paused' : ''}`}
      role={message.type === 'error' ? 'alert' : 'status'}
      style={{ '--toast-duration': `${duration}ms` } as CSSProperties}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <span className="message-icon" aria-hidden="true">
        {MESSAGE_ICONS[message.type]}
      </span>
      <span className="message-text">{message.text}</span>
      <button
        type="button"
        className="dismiss-message"
        onClick={triggerClose}
        aria-label="Cerrar aviso"
      >
        ×
      </button>
    </div>
  );
}

interface FlashMessagesProps {
  messages: FlashMessage[];
  onDismiss: (id: number) => void;
  variant?: 'default' | 'auth';
}

export function FlashMessages({ messages, onDismiss, variant = 'default' }: FlashMessagesProps) {
  if (messages.length === 0) return null;
  return (
    <div
      className={variant === 'auth' ? 'auth-messages' : 'messages'}
      aria-live="polite"
      aria-atomic="false"
    >
      {messages.map((message) => (
        <FlashMessageItem key={message.id} message={message} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
