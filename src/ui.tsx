import React, { useState } from 'react';

// ─── Layout ───────────────────────────────────────────────────────────────────

interface StackProps {
  children: React.ReactNode;
  gap?: number;
  style?: React.CSSProperties;
  className?: string;
}

export function Stack({ children, gap = 12, style, className }: StackProps) {
  return (
    <div
      className={className}
      style={{ display: 'flex', flexDirection: 'column', gap, ...style }}
    >
      {children}
    </div>
  );
}

interface RowProps {
  children: React.ReactNode;
  gap?: number;
  align?: 'start' | 'center' | 'end' | 'stretch';
  wrap?: boolean;
  style?: React.CSSProperties;
}

export function Row({ children, gap = 8, align = 'stretch', wrap, style }: RowProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: align,
        flexWrap: wrap ? 'wrap' : 'nowrap',
        gap,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

interface GridProps {
  children: React.ReactNode;
  columns?: number;
  gap?: number;
  style?: React.CSSProperties;
}

export function Grid({ children, columns = 4, gap = 12, style }: GridProps) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${columns}, 1fr)`,
        gap,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function Spacer() {
  return <div style={{ flex: 1 }} />;
}

export function Divider() {
  return <hr className="divider" />;
}

// ─── Typography ───────────────────────────────────────────────────────────────

export function H1({ children }: { children: React.ReactNode }) {
  return <h1 className="h1">{children}</h1>;
}

export function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="h2">{children}</h2>;
}

export function H3({ children }: { children: React.ReactNode }) {
  return <h3 className="h3">{children}</h3>;
}

interface TextProps {
  children: React.ReactNode;
  size?: 'small' | 'medium' | 'large';
  tone?: 'primary' | 'secondary' | 'tertiary' | 'danger';
  style?: React.CSSProperties;
}

export function Text({ children, size = 'medium', tone = 'primary', style }: TextProps) {
  return (
    <span
      className={`text text-${size} text-tone-${tone}`}
      style={style}
    >
      {children}
    </span>
  );
}

// ─── Inputs ───────────────────────────────────────────────────────────────────

interface TextInputProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  style?: React.CSSProperties;
  disabled?: boolean;
}

export function TextInput({ value, onChange, placeholder, type = 'text', style, disabled }: TextInputProps) {
  return (
    <input
      className="input"
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={style}
      disabled={disabled}
    />
  );
}

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  value: string;
  onChange: (v: string) => void;
  options: SelectOption[];
  style?: React.CSSProperties;
}

export function Select({ value, onChange, options, style }: SelectProps) {
  return (
    <select
      className="select"
      value={value}
      onChange={e => onChange(e.target.value)}
      style={style}
    >
      {options.map(o => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

interface TextAreaProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}

export function TextArea({ value, onChange, placeholder, rows = 4 }: TextAreaProps) {
  return (
    <textarea
      className="textarea"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
    />
  );
}

// ─── Buttons ─────────────────────────────────────────────────────────────────

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface ButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  title?: string;
}

export function Button({ children, onClick, variant = 'secondary', disabled, title }: ButtonProps) {
  return (
    <button
      className={`btn btn-${variant}`}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      {children}
    </button>
  );
}

interface IconButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  title?: string;
}

export function IconButton({ children, onClick, title }: IconButtonProps) {
  return (
    <button className="icon-btn" onClick={onClick} title={title}>
      {children}
    </button>
  );
}

// ─── Pill ─────────────────────────────────────────────────────────────────────

type PillTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

interface PillProps {
  children: React.ReactNode;
  tone?: PillTone;
  active?: boolean;
  size?: 'sm' | 'md';
  onClick?: () => void;
}

export function Pill({ children, tone = 'neutral', active, size = 'md', onClick }: PillProps) {
  const cls = [
    'pill',
    `pill-${size}`,
    `pill-tone-${tone}`,
    active ? 'pill-active' : '',
    onClick ? 'pill-clickable' : '',
  ].filter(Boolean).join(' ');
  return (
    <span className={cls} onClick={onClick} role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined}>
      {children}
    </span>
  );
}

// ─── Stat ─────────────────────────────────────────────────────────────────────

type StatTone = 'success' | 'warning' | 'danger' | 'info';

interface StatProps {
  value: React.ReactNode;
  label: string;
  tone?: StatTone;
}

export function Stat({ value, label, tone }: StatProps) {
  return (
    <div className="stat">
      <div className={`stat-value${tone ? ` stat-tone-${tone}` : ''}`}>{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

// ─── Callout ─────────────────────────────────────────────────────────────────

type CalloutTone = 'info' | 'success' | 'warning' | 'danger' | 'neutral';

interface CalloutProps {
  children?: React.ReactNode;
  tone?: CalloutTone;
  title?: string;
}

export function Callout({ children, tone = 'neutral', title }: CalloutProps) {
  return (
    <div className={`callout callout-${tone}`}>
      {title && <div className="callout-title">{title}</div>}
      {children && <div className="callout-body">{children}</div>}
    </div>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────

interface CardProps {
  children: React.ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
}

export function Card({ children, collapsible, defaultOpen = true }: CardProps) {
  const [open, setOpen] = useState(defaultOpen);

  if (collapsible) {
    const [header, ...body] = React.Children.toArray(children);
    return (
      <div className="card">
        <div onClick={() => setOpen(o => !o)} style={{ cursor: 'pointer' }}>
          {React.isValidElement(header)
            ? React.cloneElement(header as React.ReactElement<CardHeaderProps>, {
                _collapsible: true,
                _open: open,
              })
            : header}
        </div>
        {open && body}
      </div>
    );
  }

  return <div className="card">{children}</div>;
}

interface CardHeaderProps {
  children: React.ReactNode;
  trailing?: React.ReactNode;
  _collapsible?: boolean;
  _open?: boolean;
}

export function CardHeader({ children, trailing, _collapsible, _open }: CardHeaderProps) {
  return (
    <div className="card-header">
      <div className="card-header-title">
        {_collapsible && (
          <span className="card-chevron" style={{ transform: _open ? 'rotate(90deg)' : 'none' }}>›</span>
        )}
        <span>{children}</span>
      </div>
      {trailing && <div className="card-header-trailing">{trailing}</div>}
    </div>
  );
}

export function CardBody({ children }: { children: React.ReactNode }) {
  return <div className="card-body">{children}</div>;
}

// ─── Table ───────────────────────────────────────────────────────────────────

type Align = 'left' | 'right' | 'center';

interface TableProps {
  headers: string[];
  rows: React.ReactNode[][];
  columnAlign?: Align[];
  striped?: boolean;
  stickyHeader?: boolean;
}

export function Table({ headers, rows, columnAlign = [], striped, stickyHeader }: TableProps) {
  return (
    <div className="table-wrap">
      <table className={`table${striped ? ' table-striped' : ''}`}>
        <thead className={stickyHeader ? 'sticky-header' : ''}>
          <tr>
            {headers.map((h, i) => (
              <th key={i} style={{ textAlign: columnAlign[i] ?? 'left' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri}>
              {row.map((cell, ci) => (
                <td key={ci} style={{ textAlign: columnAlign[ci] ?? 'left' }}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
