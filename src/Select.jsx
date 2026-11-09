import React, { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

// A small listbox that replaces the native select so menus match the board in
// both themes. Options are { value, label }.
export function Select({ label, value, options, onChange, className = '', align = 'left' }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef(null);
  const button = useRef(null);
  const list = useRef(null);
  const id = useId();
  const selected = options.find(option => option.value === value) ?? options[0];
  useEffect(() => {
    if (!open) return;
    const dismiss = event => { if (!root.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [open]);
  useEffect(() => { if (open) list.current?.querySelector('[data-active=true]')?.scrollIntoView({ block: 'nearest' }); }, [open, active]);
  function show(index = Math.max(0, options.indexOf(selected))) { setActive(index); setOpen(true); }
  function choose(option) { onChange(option.value); setOpen(false); button.current?.focus(); }
  function onKeyDown(event) {
    const last = options.length - 1;
    const keys = {
      ArrowDown: () => open ? setActive(i => Math.min(last, i + 1)) : show(),
      ArrowUp: () => open ? setActive(i => Math.max(0, i - 1)) : show(),
      Home: () => open && setActive(0),
      End: () => open && setActive(last),
      Enter: () => open ? choose(options[active]) : show(),
      ' ': () => open ? choose(options[active]) : show(),
      Escape: () => { if (!open) return false; setOpen(false); },
      Tab: () => { setOpen(false); return false; },
    };
    if (keys[event.key]) { if (keys[event.key]() !== false) { event.preventDefault(); event.stopPropagation(); } return; }
    if (open && event.key.length === 1) {
      // Jump to the next option starting with the typed letter.
      const letter = event.key.toLowerCase();
      const order = [...options.slice(active + 1), ...options.slice(0, active + 1)];
      const match = order.find(option => option.label.toLowerCase().startsWith(letter));
      if (match) setActive(options.indexOf(match));
    }
  }
  return <div ref={root} className={`select ${open ? 'open' : ''} ${className}`}>
    <button ref={button} type="button" className="select-trigger" aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? id : undefined}
      aria-label={`${label}: ${selected.label}`} aria-activedescendant={open ? `${id}-${active}` : undefined}
      onClick={() => open ? setOpen(false) : show()} onKeyDown={onKeyDown}>
      <span>{selected.label}</span><ChevronDown size={13}/>
    </button>
    {open && <ul ref={list} id={id} role="listbox" aria-label={label} className={`select-menu align-${align}`}>
      {options.map((option, index) => <li key={option.value} id={`${id}-${index}`} role="option" aria-selected={option.value === value} data-active={index === active}
        onPointerMove={() => setActive(index)} onPointerDown={event => event.preventDefault()} onClick={() => choose(option)}>
        <span>{option.label}</span>{option.value === value && <Check size={13}/>}
      </li>)}
    </ul>}
  </div>;
}
