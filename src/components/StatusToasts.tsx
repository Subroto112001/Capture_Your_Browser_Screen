import {useEffect} from 'react';
import {Check, Info, X} from 'lucide-react';

export interface ToastMessage {
  id: number;
  message: string;
  kind: 'success' | 'info';
}

export function StatusToasts({items, onDismiss}: {items: ToastMessage[]; onDismiss: (id: number) => void}) {
  useEffect(() => {
    const timers = items.map(item => window.setTimeout(() => onDismiss(item.id), 3800));
    return () => timers.forEach(window.clearTimeout);
  }, [items, onDismiss]);
  return <div className="toast-stack" aria-live="polite" aria-relevant="additions text">
    {items.map(item => <div className={`toast toast--${item.kind}`} key={item.id} role="status">
      {item.kind === 'success' ? <Check size={17} aria-hidden="true" /> : <Info size={17} aria-hidden="true" />}
      <span>{item.message}</span>
      <button type="button" onClick={() => onDismiss(item.id)} aria-label="Dismiss notification"><X size={15} /></button>
    </div>)}
  </div>;
}
