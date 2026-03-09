import { CheckCircle, Clock, AlertCircle, ShieldAlert } from "lucide-react";
import { getRiskStatus, calcularDiasAtraso } from "@/lib/financeRules";

// ─── Re-export financeRules types so existing imports keep working ─────────────
export type { RiskLevel } from "@/lib/financeRules";
export { getRiskStatus } from "@/lib/financeRules";

/**
 * Maps the overdue risk level to the RiskBadge display string.
 * "EM DIA" / "ATRASO" / "INADIMPLENTE" / "PERDA" align 1-to-1 with
 * the RiskLevel type from financeRules — this union adds "CONCLUÍDO".
 */
export type RiskStatus = "EM DIA" | "ATRASO" | "INADIMPLENTE" | "PERDA" | "CONCLUÍDO";

interface RiskConfig {
    label: string;
    badge: string;
    glow: string;
    icon: React.ReactNode;
}

export const riskConfig: Record<RiskStatus, RiskConfig> = {
    "EM DIA": {
        label: "Em Dia",
        badge: "bg-green-500/10 text-green-400 border border-green-500/30",
        glow: "shadow-[0_0_32px_rgba(34,197,94,0.15)]",
        icon: <CheckCircle size={16} />,
    },
    "ATRASO": {
        label: "Em Atraso",
        badge: "bg-orange-500/10 text-orange-400 border border-orange-500/30",
        glow: "shadow-[0_0_32px_rgba(249,115,22,0.15)]",
        icon: <Clock size={16} />,
    },
    "INADIMPLENTE": {
        label: "Inadimplente",
        badge: "bg-red-500/10 text-red-400 border border-red-500/30",
        glow: "shadow-[0_0_32px_rgba(239,68,68,0.15)]",
        icon: <AlertCircle size={16} />,
    },
    "PERDA": {
        label: "Perda de Faturamento",
        badge: "bg-red-900/20 text-red-600 border border-red-700/40",
        glow: "shadow-[0_0_32px_rgba(185,28,28,0.2)]",
        icon: <ShieldAlert size={16} />,
    },
    "CONCLUÍDO": {
        label: "Concluído",
        badge: "bg-gray-500/10 text-gray-400 border border-gray-500/20",
        glow: "",
        icon: <CheckCircle size={16} />,
    },
};

/**
 * Derive the visual RiskStatus for a client/contract given its most-overdue
 * installment. Uses the central `getRiskStatus` rule from financeRules.ts.
 *
 * @param maxDueDate "YYYY-MM-DD" of the oldest unpaid installment
 * @param todayStr   Current date as "YYYY-MM-DD"
 * @param allPaid    Pass `true` when all installments are PAGO → returns "CONCLUÍDO"
 */
export function deriveClientRiskStatus(
    maxDueDate: string | null,
    todayStr: string,
    allPaid: boolean = false
): RiskStatus {
    if (allPaid) return "CONCLUÍDO";
    if (!maxDueDate) return "EM DIA";
    const dias = calcularDiasAtraso(maxDueDate, todayStr);
    return getRiskStatus(dias) as RiskStatus;
}

interface RiskBadgeProps {
    status: RiskStatus;
    /** When true, renders the large pill used in the hero card header */
    size?: "sm" | "lg";
}

export default function RiskBadge({ status, size = "sm" }: RiskBadgeProps) {
    const cfg = riskConfig[status];
    const padding = size === "lg" ? "px-3 py-1 text-xs" : "px-2.5 py-0.5 text-[10px]";

    return (
        <span
            className={`inline-flex items-center gap-1.5 rounded-full font-bold uppercase tracking-wide ${padding} ${cfg.badge}`}
        >
            {cfg.icon}
            {cfg.label}
        </span>
    );
}

