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
    data_vencimento: string; // "YYYY-MM-DD"
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
    selectedDate: string;   // "YYYY-MM-DD"
    previsaoMes: number;
}

// ─── Custom Tooltip ───────────────────────────────────────────────────────────
interface CustomTooltipProps {
    active?: boolean;
    payload?: { value: number; payload: ChartDayPoint }[];
    label?: string;
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
    if (!active || !payload?.length) return null;
    const { value, payload: pt } = payload[0];
    const [y, m, d] = pt.date.split("-");
    return (
        <div className="rounded-xl bg-black/90 border border-white/10 px-3 py-2 shadow-xl text-xs">
            <p className="text-gray-400 mb-1">{d}/{m}/{y}</p>
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
}: RecebimentosChartProps) {
    const router = useRouter();

    // Build a day-keyed sum map
    const sumByDate = new Map<string, number>();
    for (const p of monthlyData) {
        sumByDate.set(p.data_vencimento, (sumByDate.get(p.data_vencimento) ?? 0) + p.valor_previsto);
    }

    // Generate all days in the month
    const days = daysInMonth(currentMonth);
    const chartPoints: ChartDayPoint[] = Array.from({ length: days }, (_, i) => {
        const dayNum = i + 1;
        const dayStr = String(dayNum).padStart(2, "0");
        const date = `${currentMonth}-${dayStr}`;
        return {
            date,
            day: dayStr,
            total: sumByDate.get(date) ?? 0,
        };
    });

    // Reference line for today if in current month
    const todayStr = new Date().toISOString().split("T")[0];
    const todayInMonth = todayStr.startsWith(currentMonth)
        ? todayStr.split("-")[2] // day "DD"
        : null;

    function handleBarClick(data: { payload?: ChartDayPoint }) {
        if (!data?.payload?.date) return;
        const { date } = data.payload;
        router.push(`?date=${date}&month=${currentMonth}`, { scroll: false });
    }

    function handlePrevMonth() {
        const pm = prevMonth(currentMonth);
        // Keep selected date in same month as navigation target
        router.push(`?month=${pm}&date=${pm}-01`, { scroll: false });
    }

    function handleNextMonth() {
        const nm = nextMonth(currentMonth);
        router.push(`?month=${nm}&date=${nm}-01`, { scroll: false });
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
                        {formatMonthLabel(currentMonth)}
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
                                if (data && data.date) {
                                    router.push(`?date=${data.date}&month=${currentMonth}`, { scroll: false });
                                }
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
                            content={({ active, payload }) => {
                                if (active && payload && payload.length) {
                                    const d = payload[0].payload as ChartDayPoint;
                                    return (
                                        <div className="bg-black/90 border border-white/10 p-3 rounded-xl shadow-xl">
                                            <p className="text-xs text-gray-400 mb-1">{d.date.split("-").reverse().join("/")}</p>
                                            <p className="text-sm font-bold text-orange-500">
                                                {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(d.total)}
                                            </p>
                                        </div>
                                    );
                                }
                                return null;
                            }}
                        />

                        {/* Today's reference line */}
                        {todayInMonth && (
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
                                if (data && data.date) {
                                    router.push(`?date=${data.date}&month=${currentMonth}`, { scroll: false });
                                }
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
