// SPDX-License-Identifier: AGPL-3.0-or-later
// Small form controls shared by the inspector and dialogs.

import { ChevronDown } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

export function Section({ title, children, defaultOpen = true, extra }: { title: string; children: ReactNode; defaultOpen?: boolean; extra?: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="inspector-section">
      <div className="section-title">
        <button onClick={() => setOpen((value) => !value)} aria-expanded={open}>
          <ChevronDown size={14} className={open ? "" : "collapsed"} />
          <span>{title}</span>
        </button>
        {extra}
      </div>
      {open && <div className="section-body">{children}</div>}
    </section>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="field">
      <label title={hint}>{label}</label>
      <div className="field-control">{children}</div>
    </div>
  );
}

export function TextInput({ value, onChange, placeholder, multiline, mono }: { value: string; onChange: (value: string) => void; placeholder?: string; multiline?: boolean; mono?: boolean }) {
  return multiline ? (
    <textarea className={mono ? "mono" : ""} value={value} placeholder={placeholder} rows={Math.min(6, Math.max(2, value.split("\n").length))} onChange={(event) => onChange(event.target.value)} />
  ) : (
    <input className={mono ? "mono" : ""} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
  );
}

/** Number input that lets the user clear the box while typing. */
export function NumberInput({ value, onChange, min = 0, max = 10000, suffix = "px", disabled }: { value: number; onChange: (value: number) => void; min?: number; max?: number; suffix?: string; disabled?: boolean }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  return (
    <span className={`number-input ${disabled ? "disabled" : ""} ${suffix ? "" : "no-suffix"}`}>
      <input
        type="number"
        value={disabled ? "" : text}
        placeholder={disabled ? "—" : undefined}
        min={min}
        max={max}
        disabled={disabled}
        onChange={(event) => {
          setText(event.target.value);
          const next = Number(event.target.value);
          if (event.target.value !== "" && Number.isFinite(next)) onChange(Math.max(min, Math.min(max, next)));
        }}
        onBlur={() => setText(String(value))}
      />
      {suffix && <span>{suffix}</span>}
    </span>
  );
}

export function NullableNumberInput({ value, onChange, placeholder }: { value: number | null; onChange: (value: number | null) => void; placeholder: string }) {
  const [text, setText] = useState(value === null ? "" : String(value));
  useEffect(() => setText(value === null ? "" : String(value)), [value]);
  return (
    <span className="number-input">
      <input
        type="number"
        min={0}
        value={text}
        placeholder={placeholder}
        onChange={(event) => {
          setText(event.target.value);
          if (event.target.value === "") onChange(null);
          else if (Number.isFinite(Number(event.target.value))) onChange(Math.max(0, Math.round(Number(event.target.value))));
        }}
      />
      <span>px</span>
    </span>
  );
}

export function ColorInput({ value, onChange, allowNone, noneLabel = "なし" }: { value: string; onChange: (value: string) => void; allowNone?: string; noneLabel?: string }) {
  const isNone = allowNone !== undefined && value === allowNone;
  const hex = /^#[0-9a-f]{6}$/i.test(value) ? value : "#ffffff";
  return (
    <span className="color-input">
      <input type="color" value={hex} onChange={(event) => onChange(event.target.value)} aria-label="色を選択" />
      <input className="mono" value={isNone ? "" : value} placeholder={isNone ? noneLabel : ""} onChange={(event) => onChange(event.target.value || allowNone || "")} />
      {allowNone !== undefined && (
        <button className={`chip ${isNone ? "active" : ""}`} onClick={() => onChange(isNone ? hex : allowNone)} title={noneLabel}>
          {noneLabel}
        </button>
      )}
    </span>
  );
}

export function Segmented<T extends string>({ value, options, onChange, compact }: { value: T; options: Array<{ value: T; label: ReactNode; title?: string }>; onChange: (value: T) => void; compact?: boolean }) {
  return (
    <div className={`segmented ${compact ? "compact" : ""}`} style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((option) => (
        <button key={option.value} className={option.value === value ? "active" : ""} title={option.title} onClick={() => onChange(option.value)}>
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ value, onChange, label }: { value: boolean; onChange: (value: boolean) => void; label?: string }) {
  return (
    <button className={`toggle-row ${value ? "on" : ""}`} onClick={() => onChange(!value)} role="switch" aria-checked={value}>
      <span className="toggle">
        <span />
      </span>
      {label && <span>{label}</span>}
    </button>
  );
}

export function Select<T extends string>({ value, options, onChange }: { value: T; options: Array<{ value: T; label: string }>; onChange: (value: T) => void }) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value as T)}>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
