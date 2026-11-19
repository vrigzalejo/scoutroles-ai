import type { ButtonHTMLAttributes } from "react";

const tones = {
  primary:
    "bg-pine text-paper hover:bg-moss disabled:cursor-wait disabled:opacity-70",
  ghost: "border border-line bg-card text-ink hover:border-pine/40",
  quiet: "text-muted hover:text-ink",
} as const;

export function Button({
  tone = "ghost",
  className = "",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: keyof typeof tones }) {
  return (
    <button
      type={type}
      className={`inline-flex cursor-pointer items-center justify-center gap-2 rounded-full px-3.5 py-2 text-sm font-medium transition ${tones[tone]} ${className}`}
      {...props}
    />
  );
}
