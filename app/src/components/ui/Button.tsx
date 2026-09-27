import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Icon, type IconName } from "@/components/icons";
import { Tooltip } from "./Tooltip";

type Variant = "default" | "primary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: IconName;
  iconRight?: IconName;
  on?: boolean;
  seam?: boolean;
  wide?: boolean;
  loading?: boolean;
  tip?: ReactNode;
  kbd?: string;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "default", size = "md", icon, iconRight, on, seam, wide, loading, tip, kbd, className, children, disabled, ...rest },
  ref,
) {
  const cls = [
    "btn",
    variant !== "default" && `btn--${variant}`,
    size !== "md" && `btn--${size}`,
    on && "btn--on",
    seam && "btn--seam",
    wide && "btn--wide",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  const el = (
    <button ref={ref} className={cls} disabled={disabled || loading} {...rest}>
      {loading ? <Icon name="spinner" size={14} className="ch-icon--spin" /> : icon && <Icon name={icon} size={15} />}
      {children}
      {iconRight && <Icon name={iconRight} size={14} />}
    </button>
  );
  return tip ? (
    <Tooltip content={tip} kbd={kbd}>
      {el}
    </Tooltip>
  ) : (
    el
  );
});

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconName;
  /** Tooltip text. Icon buttons carry no visible label, so this is the label. */
  label: string;
  kbd?: string;
  hint?: string;
  size?: "sm" | "md" | "lg";
  iconSize?: number;
  variant?: "default" | "accent" | "danger" | "quiet";
  on?: boolean;
  spin?: boolean;
  tipSide?: "auto" | "top" | "bottom" | "left" | "right";
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, label, kbd, hint, size = "md", iconSize, variant = "default", on, spin, tipSide = "auto", className, ...rest },
  ref,
) {
  const cls = ["iconbtn", size !== "md" && `iconbtn--${size}`, variant !== "default" && `iconbtn--${variant}`, on && "iconbtn--on", className].filter(Boolean).join(" ");
  const px = iconSize ?? (size === "sm" ? 15 : size === "lg" ? 19 : 17);
  return (
    <Tooltip content={label} kbd={kbd} hint={hint} side={tipSide}>
      <button ref={ref} className={cls} aria-label={label} {...rest}>
        <Icon name={icon} size={px} className={spin ? "ch-icon--spin" : undefined} />
      </button>
    </Tooltip>
  );
});
