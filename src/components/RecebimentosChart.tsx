"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    Cell,
    ReferenceLine,
    CartesianGrid,
} from "recharts";
import { brl } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface MonthlyParcela {
    data_vencimento: string;                      // "YYYY-MM-DD"
    data_disponibilidade_prevista?: string;        // optional clearing date
    valor_previsto: number;
}

interface ChartDayPoint {
    date: string; // "YYYY-MM-DD" — used for router navigation & selected highlight
    day: string;  // "DD" — XAxis label
    total: number;
}

interface RecebimentosChartProps {
    monthlyData: MonthlyParcela[];
    currentMonth: string;   // "YYYY-MM"
    selectedDate: string;   // "YYYY-MM-DD" (daily) or "YYYY-MM" (annual)
    previsaoMes: number;
    /** Which date field to group by. Defaults to 'data_vencimento'. */
    dateKey?: 'data_vencimento' | 'data_disponibilidade_prevista';
    /** Render 12-month annual bars instead of daily bars. */
    isAnnual?: boolean;
    /** The year string ("YYYY") used when isAnnual is true. */
    year?: string;
}

// ─── Custom Tooltip ───────────────────────────────────────────────────────────
interface CustomTooltipProps {
    active?: boolean;
    payload?: { value: number; payload: ChartDayPoint }[];
    label?: string;
}

function CustomTooltip({ active, payload, isAnnual }: CustomTooltipProps & { isAnnual?: boolean }) {
    if (!active || !payload?.length) return null;
    const { value, payload: pt } = payload[0];
    // Annual: date is "YYYY-MM" — display as "MMM/YYYY"
    // Daily:  date is "YYYY-MM-DD" — display as "DD/MM/YYYY"
    const label = isAnnual
        ? (() => { const [y, m] = pt.date.split('-'); return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }); })()
        : pt.date.split('-').reverse().join('/');
    return (
        <div className="rounded-xl bg-black/90 border border-white/10 px-3 py-2 shadow-xl text-xs">
            <p className="text-gray-400 mb-1 capitalize">{label}</p>
            <p className="font-bold text-orange-400">{brl(value)}</p>
        </div>
    );
}

// ─── Month helpers ────────────────────────────────────────────────────────────
function prevMonth(ym: string): string {
    const [y, m] = ym.split("-").map(Number);
    const d = new Date(y, m - 2, 1); // month is 0-indexed
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function nextMonth(ym: string): string {
    const [y, m] = ym.split("-").map(Number);
    const d = new Date(y, m, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function formatMonthLabel(ym: string): string {
    const [y, m] = ym.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString("pt-BR", {
        month: "long",
        year: "numeric",
    });
}

function daysInMonth(ym: string): number {
    const [y, m] = ym.split("-").map(Number);
    return new Date(y, m, 0).getDate();
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function RecebimentosChart({
    monthlyData,
    currentMonth,
    selectedDate,
    previsaoMes,
    dateKey = 'data_vencimento',
    isAnnual = false,
    year,
}: RecebimentosChartProps) {
    const router = useRouter();

    // ── Build chart points ─────────────────────────────────────────────────────
    const chartPoints: ChartDayPoint[] = [];

    if (isAnnual && year) {
        // Annual mode: group all parcelas by month → 12 bars
        const monthNames = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
        const sumByMonth = new Map<string, number>();
        for (const p of monthlyData) {
            const dKey = p[dateKey] ?? p.data_vencimento;
            if (!dKey) continue;
            const ym = dKey.slice(0, 7); // 'YYYY-MM'
            sumByMonth.set(ym, (sumByMonth.get(ym) ?? 0) + (p.valor_previsto || 0));
        }
        for (let i = 0; i < 12; i++) {
            const mStr = String(i + 1).padStart(2, "0");
            const ym = `${year}-${mStr}`;
            chartPoints.push({ date: ym, day: monthNames[i], total: sumByMonth.get(ym) ?? 0 });
        }
    } else {
        // Daily mode: one bar per day in the current month
        const sumByDate = new Map<string, number>();
        for (const p of monthlyData) {
            const key = p[dateKey] ?? p.data_vencimento;
            sumByDate.set(key, (sumByDate.get(key) ?? 0) + p.valor_previsto);
        }
        const days = daysInMonth(currentMonth);
        for (let i = 0; i < days; i++) {
            const dayStr = String(i + 1).padStart(2, "0");
            const date = `${currentMonth}-${dayStr}`;
            chartPoints.push({ date, day: dayStr, total: sumByDate.get(date) ?? 0 });
        }
    }

    // Reference line for today — daily mode only
    const todayStr = new Date().toISOString().split("T")[0];
    const todayInMonth = !isAnnual && todayStr.startsWith(currentMonth)
        ? todayStr.split("-")[2] // "DD"
        : null;

    function navigate(date: string) {
        if (isAnnual) {
            // Drill-down: annual bar click → navigate to monthly view for that month
            router.push(`?period=monthly&date=${date}-01`, { scroll: false });
        } else {
            router.push(`?date=${date}&month=${currentMonth}`, { scroll: false });
        }
    }

    function handlePrevMonth() {
        if (isAnnual && year) {
            router.push(`?period=annual&date=${Number(year) - 1}-01`, { scroll: false });
        } else {
            const pm = prevMonth(currentMonth);
            router.push(`?month=${pm}&date=${pm}-01`, { scroll: false });
        }
    }

    function handleNextMonth() {
        if (isAnnual && year) {
            router.push(`?period=annual&date=${Number(year) + 1}-01`, { scroll: false });
        } else {
            const nm = nextMonth(currentMonth);
            router.push(`?month=${nm}&date=${nm}-01`, { scroll: false });
        }
    }

    return (
        <div className="flex flex-col gap-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                {/* Month navigation */}
                <div className="flex items-center gap-2">
                    <button
                        onClick={handlePrevMonth}
                        className="flex items-center justify-center w-7 h-7 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 hover:border-orange-500/50 text-gray-400 hover:text-orange-400 transition-all"
                    >
                        <ChevronLeft size={14} />
                    </button>
                    <span className="text-sm font-bold text-white capitalize min-w-[120px] text-center">
                        {isAnnual && year ? year : formatMonthLabel(currentMonth)}
                    </span>
                    <button
                        onClick={handleNextMonth}
                        className="flex items-center justify-center w-7 h-7 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 hover:border-orange-500/50 text-gray-400 hover:text-orange-400 transition-all"
                    >
                        <ChevronRight size={14} />
                    </button>
                </div>

                {/* Forecast badge */}
                <span className="rounded-full bg-orange-500/15 border border-orange-500/40 px-4 py-1 text-xs font-bold text-orange-400">
                    Previsão {brl(previsaoMes)}
                </span>
            </div>

            {/* Chart */}
            <div
                className="w-full h-[250px] [&_*:focus]:outline-none [&_rect:focus]:outline-none [&_svg:focus]:outline-none [&_*]:focus-visible:outline-none"
                style={{ WebkitTapHighlightColor: "transparent", cursor: "pointer" }}
            >
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                        data={chartPoints}
                        margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        onClick={(state: any) => {
                            if (state && state.activePayload && state.activePayload.length > 0) {
                                const data = state.activePayload[0].payload;
                                if (data && data.date) navigate(data.date);
                            }
                        }}
                    >
                        <CartesianGrid
                            vertical={false}
                            stroke="rgba(255,255,255,0.05)"
                            strokeDasharray="4 4"
                        />
                        <XAxis
                            dataKey="day"
                            tick={{ fill: "#6b7280", fontSize: 10 }}
                            axisLine={false}
                            tickLine={false}
                            interval={0}
                        />
                        <YAxis
                            tickFormatter={(v: number) =>
                                new Intl.NumberFormat("pt-BR", {
                                    notation: "compact",
                                    style: "currency",
                                    currency: "BRL",
                                }).format(v)
                            }
                            tick={{ fill: "#6b7280", fontSize: 10 }}
                            axisLine={false}
                            tickLine={false}
                            width={60}
                        />
                        <Tooltip
                            cursor={{ fill: "#ea580c", opacity: 0.1 }}
                            content={({ active, payload }) => (
                                <CustomTooltip active={active} payload={payload as any} isAnnual={isAnnual} />
                            )}
                        />

                        {/* Today's reference line — daily mode only */}
                        {!isAnnual && todayInMonth && (
                            <ReferenceLine
                                x={todayInMonth}
                                stroke="#f97316"
                                strokeDasharray="4 4"
                                strokeWidth={1.5}
                                label={{
                                    value: "Hoje",
                                    position: "insideTopRight",
                                    fill: "#f97316",
                                    fontSize: 10,
                                }}
                            />
                        )}

                        <Bar
                            dataKey="total"
                            radius={[4, 4, 0, 0]}
                            minPointSize={10}
                            cursor="pointer"
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            onClick={(data: any) => {
                                if (data && data.date) navigate(data.date);
                            }}
                        >
                            {chartPoints.map((entry, index) => (
                                <Cell
                                    key={`cell-${index}`}
                                    fill={entry.date === selectedDate ? "#f97316" : "#ea580c80"}
                                    style={{ outline: "none" }}
                                />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>

            {/* Hint */}
            <p className="text-[10px] text-gray-600 text-center -mt-2">
                Clique em um dia para ver a agenda daquele dia no painel esquerdo
            </p>
        </div>
    );
}
