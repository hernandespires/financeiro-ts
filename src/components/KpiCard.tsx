"use client";

import { CheckCircle, Clock, AlertCircle, ShieldAlert } from "lucide-react";

export type KpiTheme = "green" | "orange" | "red" | "darkRed" | "gray";

interface KpiCardProps {
    title: string;
    value: string | number;
    subtitle?: string;
    colorTheme: KpiTheme;
    isActive?: boolean;
    onClick?: () => void;
}

const themeConfig: Record<
    KpiTheme,
    {
        icon: React.ReactNode;
        valueClass: string;
        borderActive: string;
        glowClass: string;
        iconBg: string;
    }
> = {
    green: {
        icon: <CheckCircle size={20} strokeWidth={1.8} />,
        valueClass: "text-[#34C759]",
        borderActive: "border-[#34C759]/50",
        glowClass: "shadow-[0_0_20px_rgba(52,199,89,0.15)]",
        iconBg: "bg-[#34C759]/10 text-[#34C759]",
    },
    orange: {
        icon: <Clock size={20} strokeWidth={1.8} />,
        valueClass: "text-[#FF9500]",
        borderActive: "border-[#FF9500]/50",
        glowClass: "shadow-[0_0_20px_rgba(255,149,0,0.15)]",
        iconBg: "bg-[#FF9500]/10 text-[#FF9500]",
    },
    red: {
        icon: <AlertCircle size={20} strokeWidth={1.8} />,
        valueClass: "text-[#FF453A]",
        borderActive: "border-[#FF453A]/50",
        glowClass: "shadow-[0_0_20px_rgba(255,69,58,0.15)]",
        iconBg: "bg-[#FF453A]/10 text-[#FF453A]",
    },
    darkRed: {
        icon: <ShieldAlert size={20} strokeWidth={1.8} />,
        valueClass: "text-[#FF3B30]",
        borderActive: "border-[#FF3B30]/50",
        glowClass: "shadow-[0_0_20px_rgba(255,59,48,0.18)]",
        iconBg: "bg-[#FF3B30]/10 text-[#FF3B30]",
    },
    gray: {
        icon: <CheckCircle size={20} strokeWidth={1.8} />,
        valueClass: "text-gray-400",
        borderActive: "border-gray-500/50",
        glowClass: "shadow-[0_0_20px_rgba(156,163,175,0.10)]",
        iconBg: "bg-white/5 text-gray-400",
    },
};

export default function KpiCard({
    title,
    value,
    subtitle,
    colorTheme,
    isActive = false,
    onClick,
}: KpiCardProps) {
    const theme = themeConfig[colorTheme];

    return (
        <button
            onClick={onClick}
            className={[
                "w-full text-left flex flex-col gap-4 rounded-2xl p-6 transition-all duration-200",
                "bg-[#0A0A0A] border border-white/[0.06]",
                "hover:scale-[1.01] hover:bg-[#111111] cursor-pointer",
                isActive
                    ? `${theme.borderActive} ${theme.glowClass}`
                    : "hover:border-white/[0.12]",
            ].join(" ")}
        >
            {/* Top row: icon + title */}
            <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${theme.iconBg}`}>
                    {theme.icon}
                </div>
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest leading-tight">
                    {title}
                </span>
            </div>

            {/* Value */}
            <div>
                <p className={`text-3xl font-black leading-none ${theme.valueClass}`}>
                    {value}
                </p>
                {subtitle && (
                    <p className="text-[11px] text-gray-500 mt-1.5">{subtitle}</p>
                )}
            </div>

            {/* Active indicator dot */}
            {isActive && (
                <div className={`h-0.5 w-8 rounded-full ${theme.valueClass.replace("text-", "bg-")}`} />
            )}
        </button>
    );
}
