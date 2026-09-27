/** The Cohere mark (two arcs closing on a point) and the serif gradient wordmark. */
import { GradientText } from "@/components/ui";
import "./brand.css";

export function Mark({ size = 22, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 1024 1024" width={size} height={size} className={["brand-mark", className].filter(Boolean).join(" ")} aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeLinecap="round">
        <path d="M 700 330 A 250 250 0 1 0 700 694" strokeWidth="92" />
        <path d="M 612 412 A 130 130 0 1 0 612 612" strokeWidth="66" opacity="0.9" />
      </g>
      <circle cx="512" cy="512" r="54" fill="currentColor" />
    </svg>
  );
}

export function Wordmark({ size = 20, mark = true, className }: { size?: number; mark?: boolean; className?: string }) {
  return (
    <span className={["brand", className].filter(Boolean).join(" ")} style={{ fontSize: size }}>
      {mark && <Mark size={size * 1.05} className="brand__mark" />}
      <GradientText className="brand__word serif">Cohere</GradientText>
    </span>
  );
}
