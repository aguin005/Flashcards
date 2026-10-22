import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { CircleAlert, CircleCheck, Info, X } from 'lucide-react';
import { Button } from './Button';
import { Modal } from './Modal';
import { Input } from './primitives';

// ---------- Toasts ----------

type ToastKind = 'success' | 'error' | 'info';
interface ToastItem {
  id: number;
  kind: ToastKind;
  title: string;
  description?: string;
}

interface ToastApi {
  toast: (t: { kind?: ToastKind; title: string; description?: string }) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setItems((list) => list.filter((t) => t.id !== id)), []);

  const toast = useCallback<ToastApi['toast']>(
    ({ kind = 'info', title, description }) => {
      const id = nextId.current++;
      setItems((list) => [...list.slice(-3), { id, kind, title, description }]);
      setTimeout(() => dismiss(id), kind === 'error' ? 8000 : 4000);
    },
    [dismiss],
  );

  const api = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6 lg:items-end lg:px-6"
      >
        {items.map((t) => (
          <div
            key={t.id}
            role={t.kind === 'error' ? 'alert' : 'status'}
            className="pointer-events-auto flex w-full max-w-sm animate-fade-in items-start gap-3 rounded-xl border border-slate-200 bg-white p-3.5 shadow-lg dark:border-slate-700 dark:bg-slate-900"
          >
            {t.kind === 'success' && <CircleCheck className="mt-0.5 size-5 shrink-0 text-emerald-600" aria-hidden />}
            {t.kind === 'error' && <CircleAlert className="mt-0.5 size-5 shrink-0 text-rose-600" aria-hidden />}
            {t.kind === 'info' && <Info className="mt-0.5 size-5 shrink-0 text-brand-600" aria-hidden />}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-900 dark:text-white">{t.title}</p>
              {t.description && <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">{t.description}</p>}
            </div>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss notification"
              className="rounded-md p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-white"
            >
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// ---------- Confirm dialog ----------

interface ConfirmOptions {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  /** When set, the user must type this text to enable the confirm button. */
  requireText?: string;
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;
const ConfirmContext = createContext<ConfirmFn | null>(null);

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used inside ConfirmProvider');
  return ctx;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);
  const [typed, setTyped] = useState('');

  const confirm = useCallback<ConfirmFn>(
    (opts) =>
      new Promise<boolean>((resolve) => {
        setTyped('');
        setState({ ...opts, resolve });
      }),
    [],
  );

  const close = (result: boolean) => {
    state?.resolve(result);
    setState(null);
  };

  const blocked = Boolean(state?.requireText) && typed.trim() !== state?.requireText;

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal
        open={state !== null}
        onClose={() => close(false)}
        title={state?.title ?? ''}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => close(false)}>
              {state?.cancelLabel ?? 'Cancel'}
            </Button>
            <Button
              variant={state?.danger ? 'danger' : 'primary'}
              disabled={blocked}
              onClick={() => close(true)}
              data-testid="confirm-ok"
            >
              {state?.confirmLabel ?? 'Confirm'}
            </Button>
          </>
        }
      >
        {state?.message && <div className="text-sm text-slate-600 dark:text-slate-300">{state.message}</div>}
        {state?.requireText && (
          <div className="mt-3">
            <label htmlFor="confirm-text" className="mb-1.5 block text-sm text-slate-600 dark:text-slate-300">
              Type <strong className="font-semibold">{state.requireText}</strong> to confirm.
            </label>
            <Input
              id="confirm-text"
              value={typed}
              autoComplete="off"
              onChange={(e) => setTyped(e.target.value)}
            />
          </div>
        )}
      </Modal>
    </ConfirmContext.Provider>
  );
}
