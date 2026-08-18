import type { ButtonHTMLAttributes, ReactNode } from "react";

type StatefulActionProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  pending?: boolean;
  pendingLabel?: string;
};

export function StatefulAction({
  children,
  disabled,
  pending = false,
  pendingLabel = "Checking…",
  ...props
}: StatefulActionProps) {
  return (
    <button {...props} aria-busy={pending || undefined} disabled={disabled || pending}>
      {pending ? pendingLabel : children}
    </button>
  );
}
