import React, { useCallback, useMemo, useState, useEffect } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle, Info, X } from 'lucide-react';
import NotificationContext from './NotificationContext';

const TOAST_STYLE = {
  success: {
    wrapper: 'bg-green-600 text-white',
    Icon: CheckCircle,
  },
  error: {
    wrapper: 'bg-red-600 text-white',
    Icon: AlertCircle,
  },
  info: {
    wrapper: 'bg-blue-600 text-white',
    Icon: Info,
  },
  warning: {
    wrapper: 'bg-amber-500 text-white',
    Icon: AlertTriangle,
  },
};

const DEFAULT_CONFIRM_OPTIONS = {
  title: 'Please confirm',
  message: 'Are you sure?',
  confirmText: 'Confirm',
  cancelText: 'Cancel',
  tone: 'danger',
};

const CONFIRM_TONE_STYLE = {
  danger: 'bg-red-600 hover:bg-red-700',
  primary: 'bg-blue-600 hover:bg-blue-700',
  neutral: 'bg-gray-700 hover:bg-gray-800',
};

const ToastItem = ({ toast, onDismiss }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onDismiss(toast.id);
    }, toast.duration || 3000);

    return () => clearTimeout(timer);
  }, [toast.id, toast.duration, onDismiss]);

  const style = TOAST_STYLE[toast.type] || TOAST_STYLE.info;
  const Icon = style.Icon;

  return (
    <div
      className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg px-4 py-3 shadow-lg transition-all ${style.wrapper}`}
      role="status"
      aria-live="polite"
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <p className="flex-1 text-sm font-medium whitespace-pre-wrap">{toast.message}</p>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        className="rounded p-0.5 transition hover:bg-white/20"
        aria-label="Close notification"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
};

const NotificationProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);
  const [confirmState, setConfirmState] = useState({
    ...DEFAULT_CONFIRM_OPTIONS,
    isOpen: false,
    resolve: null,
  });

  const dismissToast = useCallback((id) => {
    setToasts((currentToasts) => currentToasts.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback((message, type = 'info', duration = 3000) => {
    if (!message) {
      return null;
    }

    const toastId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setToasts((currentToasts) => [
      ...currentToasts,
      {
        id: toastId,
        message,
        type,
        duration,
      },
    ]);

    return toastId;
  }, []);

  const success = useCallback((message, duration) => show(message, 'success', duration), [show]);
  const error = useCallback((message, duration) => show(message, 'error', duration), [show]);
  const info = useCallback((message, duration) => show(message, 'info', duration), [show]);
  const warning = useCallback((message, duration) => show(message, 'warning', duration), [show]);

  const confirm = useCallback((options = {}) => {
    return new Promise((resolve) => {
      setConfirmState({
        ...DEFAULT_CONFIRM_OPTIONS,
        ...options,
        isOpen: true,
        resolve,
      });
    });
  }, []);

  const resolveConfirm = useCallback((result) => {
    setConfirmState((currentState) => {
      if (typeof currentState.resolve === 'function') {
        currentState.resolve(result);
      }

      return {
        ...DEFAULT_CONFIRM_OPTIONS,
        isOpen: false,
        resolve: null,
      };
    });
  }, []);

  const contextValue = useMemo(
    () => ({
      notify: {
        show,
        success,
        error,
        info,
        warning,
      },
      confirm,
    }),
    [show, success, error, info, warning, confirm],
  );

  const confirmTone = CONFIRM_TONE_STYLE[confirmState.tone] || CONFIRM_TONE_STYLE.danger;

  return (
    <NotificationContext.Provider value={contextValue}>
      {children}

      <div className="pointer-events-none fixed right-4 top-4 z-70 flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2">
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={dismissToast} />
        ))}
      </div>

      {confirmState.isOpen && (
        <div
          className="fixed inset-0 z-80 flex items-center justify-center bg-black/30 p-4"
          onClick={() => resolveConfirm(false)}
          role="presentation"
        >
          <div
            className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-dialog-title"
            aria-describedby="confirm-dialog-message"
          >
            <h3 id="confirm-dialog-title" className="text-lg font-semibold text-gray-900">
              {confirmState.title}
            </h3>
            <p id="confirm-dialog-message" className="mt-2 text-sm text-gray-600 whitespace-pre-wrap">
              {confirmState.message}
            </p>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => resolveConfirm(false)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100"
              >
                {confirmState.cancelText}
              </button>
              <button
                type="button"
                onClick={() => resolveConfirm(true)}
                className={`rounded-lg px-4 py-2 text-sm font-medium text-white transition ${confirmTone}`}
              >
                {confirmState.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </NotificationContext.Provider>
  );
};

export default NotificationProvider;
