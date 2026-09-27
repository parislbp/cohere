/** Form primitives: TextInput, Field, Checkbox, Switch, Stepper, Segmented. */
import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";
import { Icon, type IconName } from "@/components/icons";
import { InfoTip, Tooltip } from "./Tooltip";

export interface TextInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  size?: "sm" | "md";
  mono?: boolean;
  ghost?: boolean;
  /** Underline-only field: no box, a hairline underneath, depth on focus. */
  line?: boolean;
}

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput({ size = "md", mono, ghost, line, className, ...rest }, ref) {
  const cls = ["input", size === "sm" && "input--sm", mono && "input--mono", ghost && "input--ghost", line && "input--line", className].filter(Boolean).join(" ");
  return <input ref={ref} className={cls} spellCheck={false} autoComplete="off" {...rest} />;
});

export function Field({ label, info, hint, error, children, className, disabled }: { label: ReactNode; info?: ReactNode; hint?: ReactNode; error?: ReactNode; children: ReactNode; className?: string; disabled?: boolean }) {
  return (
    <label className={["field", disabled && "is-disabled", className].filter(Boolean).join(" ")} aria-disabled={disabled || undefined}>
      <span className="field__label">
        {label}
        {info && <InfoTip content={info} />}
      </span>
      {children}
      {error ? <span className="field__error">{error}</span> : hint ? <span className="field__hint">{hint}</span> : null}
    </label>
  );
}

export function Checkbox({ checked, mixed, onChange, label, disabled }: { checked: boolean; mixed?: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <Tooltip content={label}>
      <button
        type="button"
        role="checkbox"
        aria-checked={mixed ? "mixed" : checked}
        aria-label={label}
        className={["checkbox", checked && "is-on", mixed && "is-mixed"].filter(Boolean).join(" ")}
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          onChange(!checked);
        }}
      >
        <Icon name={mixed ? "minus" : "check"} size={11} strokeWidth={2.2} />
      </button>
    </Tooltip>
  );
}

export function Switch({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} className={["switch", on && "is-on"].filter(Boolean).join(" ")} disabled={disabled} onClick={() => onChange(!on)} />
  );
}

export function Stepper({ value, onChange, min = 0, max = 99, label, disabled }: { value: number; onChange: (v: number) => void; min?: number; max?: number; label: string; disabled?: boolean }) {
  const set = (v: number) => onChange(Math.min(max, Math.max(min, Math.round(v))));
  return (
    <div className={["stepper", disabled && "is-disabled"].filter(Boolean).join(" ")} aria-label={label}>
      <button type="button" aria-label={`${label}: less`} onClick={() => set(value - 1)} disabled={disabled || value <= min}>
        <Icon name="minus" size={13} />
      </button>
      <input
        type="text"
        inputMode="numeric"
        value={value}
        disabled={disabled}
        aria-label={label}
        onChange={(e) => {
          const n = parseInt(e.target.value, 10);
          if (!Number.isNaN(n)) set(n);
          else if (e.target.value === "") onChange(min);
        }}
      />
      <button type="button" aria-label={`${label}: more`} onClick={() => set(value + 1)} disabled={disabled || value >= max}>
        <Icon name="plus" size={13} />
      </button>
    </div>
  );
}

export interface SegmentedOption<T extends string> {
  id: T;
  label: ReactNode;
  icon?: IconName;
  tip?: ReactNode;
  /** Accessible name when the visible label is not descriptive (e.g. a count). */
  ariaLabel?: string;
  disabled?: boolean;
}

export function Segmented<T extends string>({ value, onChange, options, size = "md", ariaLabel }: { value: T; onChange: (v: T) => void; options: SegmentedOption<T>[]; size?: "sm" | "md"; ariaLabel: string }) {
  return (
    <div className={["seg", size === "sm" && "seg--sm"].filter(Boolean).join(" ")} role="radiogroup" aria-label={ariaLabel}>
      {options.map((o) => {
        const btn = (
          <button key={o.id} type="button" role="radio" aria-checked={value === o.id} aria-label={o.ariaLabel} className={["seg__item", value === o.id && "is-on"].filter(Boolean).join(" ")} disabled={o.disabled} onClick={() => onChange(o.id)}>
            {o.icon && <Icon name={o.icon} size={13} />}
            {o.label}
          </button>
        );
        return o.tip ? (
          <Tooltip key={o.id} content={o.tip}>
            {btn}
          </Tooltip>
        ) : (
          btn
        );
      })}
    </div>
  );
}
