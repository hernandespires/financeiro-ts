"use client";

import { ButtonHTMLAttributes, ReactNode } from "react";
import { Loader2 } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
export type ButtonVariant =
    | "primary"   // orange — main CTA
    | "success"   // green  — confirm / pay
    | "danger"    // red    — delete / irreversible
    | "info"      // blue   — edit / neutral action
    | "outline"   // ghost border — cancel
    | "ghost";    // fully transparent — contextual

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: ButtonVariant;
    isLoading?: boolean;
    icon?: ReactNode;
}

// ─── Variant styles ───────────────────────────────────────────────────────────
const variantCls: Record<ButtonVariant, string> = {
    primary:
        "bg-orange-500 hover:bg-orange-400 active:bg-orange-600 text-black",
    success:
        "bg-green-500 hover:bg-green-400 active:bg-green-600 text-black",
    danger:
        "bg-red-500 hover:bg-red-400 active:bg-red-600 text-white",
    info:
        "bg-blue-500 hover:bg-blue-400 active:bg-blue-600 text-white",
    outline:
        "border border-white/10 hover:border-white/20 bg-transparent text-gray-400 hover:text-white",
    ghost:
        "bg-transparent text-gray-400 hover:text-white",
};

// ─── Component ────────────────────────────────────────────────────────────────
export default function Button({
    variant = "primary",
    isLoading = false,
    icon,
    children,
    disabled,
    className = "",
    ...rest
}: ButtonProps) {
    const base =
        "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed";

    return (
        <button
            {...rest}
            disabled={disabled || isLoading}
            className={`${base} ${variantCls[variant]} ${className}`}
        >
            {isLoading ? <Loader2 size={14} className="animate-spin" /> : icon}
            {children}
        </button>
    );
}
