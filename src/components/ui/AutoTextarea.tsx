import { useLayoutEffect, useRef, type TextareaHTMLAttributes } from 'react';
import { Textarea } from './primitives';

/** Textarea that grows with its content. */
export function AutoTextarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [props.value]);
  return <Textarea ref={ref} rows={1} {...props} className={`resize-none overflow-hidden ${props.className ?? ''}`} />;
}
