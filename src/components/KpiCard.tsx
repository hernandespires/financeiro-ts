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
        valueClass: "text-green-400",
        borderActive: "border-green-500/60",
        glowClass: "shadow-[0_0_18px_rgba(34,197,94,0.18)]",
        iconBg: "bg-green-500/10 text-green-400",
    },
    orange: {
        icon: <Clock size={20} strokeWidth={1.8} />,
        valueClass: "text-orange-400",
        borderActive: "border-orange-500/60",
        glowClass: "shadow-[0_0_18px_rgba(249,115,22,0.18)]",
        iconBg: "bg-orange-500/10 text-orange-400",
    },
    red: {
        icon: <AlertCircle size={20} strokeWidth={1.8} />,
        valueClass: "text-red-400",
        borderActive: "border-red-500/60",
        glowClass: "shadow-[0_0_18px_rgba(239,68,68,0.18)]",
        iconBg: "bg-red-500/10 text-red-400",
    },
    darkRed: {
        icon: <ShieldAlert size={20} strokeWidth={1.8} />,
        valueClass: "text-red-600",
        borderActive: "border-red-700/60",
        glowClass: "shadow-[0_0_18px_rgba(185,28,28,0.25)]",
        iconBg: "bg-red-900/30 text-red-600",
    },
    gray: {
        icon: <CheckCircle size={20} strokeWidth={1.8} />,
        valueClass: "text-gray-400",
        borderActive: "border-gray-500/60",
        glowClass: "shadow-[0_0_18px_rgba(156,163,175,0.12)]",
        iconBg: "bg-gray-500/10 text-gray-400",
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
                "bg-black/40 backdrop-blur-md border",
                "hover:scale-[1.02] hover:bg-black/60 cursor-pointer",
                isActive
                    ? `${theme.borderActive} ${theme.glowClass}`
                    : "border-white/10 hover:border-white/20",
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
