"use client";

import { ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
type MaxWidth = "md" | "lg" | "xl" | "2xl" | "3xl" | "4xl" | "5xl";

interface ModalProps {
    isOpen?: boolean;         // if provided, component self-guards; otherwise caller controls
    onClose: () => void;
    title: string;
    subtitle?: string;
    icon?: ReactNode;         // coloured icon badge rendered left of the title
    children: ReactNode;
    maxWidth?: MaxWidth;
}

// ─── Width map ────────────────────────────────────────────────────────────────
const maxWidthCls: Record<MaxWidth, string> = {
    md: "max-w-md",
    lg: "max-w-lg",
    xl: "max-w-xl",
    "2xl": "max-w-2xl",
    "3xl": "max-w-3xl",
    "4xl": "max-w-4xl",
    "5xl": "max-w-5xl",
};

// ─── Component ────────────────────────────────────────────────────────────────
export default function Modal({
    isOpen,
    onClose,
    title,
    subtitle,
    icon,
    children,
    maxWidth = "md",
}: ModalProps) {
    // When isOpen is explicitly passed as false, suppress the portal
    if (isOpen === false) return null;

    return createPortal(
        <div
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
            onClick={(e) => e.target === e.currentTarget && onClose()}
        >
            <div
                className={`relative w-full ${maxWidthCls[maxWidth]} rounded-2xl bg-[#111] border border-white/10 shadow-2xl shadow-black/60 p-6 flex flex-col gap-6`}
            >
                {/* Close button */}
                <button
                    onClick={onClose}
                    aria-label="Fechar"
                    className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors"
                >
                    <X size={18} />
                </button>

                {/* Header */}
                <div className="flex items-center gap-3">
                    {icon && (
                        <span className="flex items-center justify-center w-9 h-9 rounded-xl shrink-0">
                            {icon}
                        </span>
                    )}
                    <div>
                        <h2 className="text-base font-bold text-white leading-tight">{title}</h2>
                        {subtitle && (
                            <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>
                        )}
                    </div>
                </div>

                {/* Content */}
                {children}
            </div>
        </div>,
        document.body
    );
}
