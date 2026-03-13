"use client";

import { useRouter } from "next/navigation";
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    ReferenceLine,
    CartesianGrid,
} from "recharts";
import { brl } from "@/lib/utils";

interface FluxoPoint {
    date: string;
    day: string;
    total: number;
}

function FluxoTooltip({ active, payload, isAnnual }: {
    active?: boolean;
    payload?: { value: number; payload: FluxoPoint }[];
    isAnnual?: boolean;
}) {
    if (!active || !payload?.length) return null;
    const { value, payload: pt } = payload[0];
    const label = isAnnual
        ? (() => {
              const [y, m] = pt.date.split("-");
              return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("pt-BR", {
                  month: "long", year: "numeric",
              });
          })()
        : pt.date.split("-").reverse().join("/");
    return (
        <div className="rounded-xl bg-[#0A0A0A] border border-white/10 px-3 py-2 shadow-xl text-xs pointer-events-none">
            <p className="text-gray-400 mb-1 capitalize">{label}</p>
            <p className="font-black text-[#ffa300]">{brl(value)}</p>
        </div>
    );
}

interface Props {
    data: FluxoPoint[];
    selectedDate: string;
    currentMonth: string;
    isAnnual?: boolean;
    year?: string;
    previsaoMes: number;
    plataforma?: string;
    statusFiltro?: string;
}

export default function PrevisaoFluxoChart({ data, selectedDate, currentMonth, isAnnual = false, year, previsaoMes, plataforma, statusFiltro }: Props) {
    const router = useRouter();

    const todayStr = new Date().toISOString().split("T")[0];
    const todayInMonth = !isAnnual && todayStr.startsWith(currentMonth) ? todayStr.split("-")[2] : null;

    function navigate(date: string) {
        const qs = new URLSearchParams();
        if (isAnnual) {
            qs.set("period", "annual");
            qs.set("date", date + "-01");
        } else {
            qs.set("date", date);
        }
        if (plataforma) qs.set("plataforma", plataforma);
        if (statusFiltro) qs.set("statusFiltro", statusFiltro);
        router.push(`?${qs.toString()}`, { scroll: false });
    }

    // YAxis width=58, margin.left=-20 → plot starts at 38px; margin.right=10
    const PLOT_LEFT = 38;
    const PLOT_RIGHT = 10;

    function handleChartClick(e: React.MouseEvent<HTMLDivElement>) {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const plotWidth = rect.width - PLOT_LEFT - PLOT_RIGHT;
        const adjustedX = x - PLOT_LEFT;
        if (adjustedX < 0 || adjustedX > plotWidth || data.length === 0) return;
        const index = Math.min(
            Math.floor((adjustedX / plotWidth) * data.length),
            data.length - 1
        );
        navigate(data[index].date);
    }

    return (
        <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
                <span className="text-[10px] text-gray-600">
                    {isAnnual ? "clique num mês para detalhar" : "clique num dia para filtrar a agenda"}
                </span>
                <span className="rounded-lg bg-[#ffa300]/10 border border-[#ffa300]/30 px-3 py-1 text-[10px] font-bold text-[#ffa300]">
                    Previsão {brl(previsaoMes)}
                </span>
            </div>

            {/* onClick no container captura o clique por posição; Recharts recebe mousemove normalmente (tooltip funciona) */}
            <div
                className="w-full h-[220px] [&_*:focus]:outline-none [&_rect:focus]:outline-none [&_svg:focus]:outline-none [&_*]:focus-visible:outline-none"
                style={{ WebkitTapHighlightColor: "transparent", cursor: "pointer" }}
                onClick={handleChartClick}
            >
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                        data={data}
                        margin={{ top: 8, right: 10, left: -20, bottom: 0 }}
                    >
                        <defs>
                            <linearGradient id="fluxoGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#ffa300" stopOpacity={0.2} />
                                <stop offset="95%" stopColor="#ffa300" stopOpacity={0} />
                            </linearGradient>
                        </defs>

                        <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.04)" strokeDasharray="3 3" />
                        <XAxis dataKey="day" tick={{ fill: "#6b7280", fontSize: 9 }} axisLine={false} tickLine={false} interval={0} />
                        <YAxis
                            tickFormatter={(v: number) => new Intl.NumberFormat("pt-BR", { notation: "compact", style: "currency", currency: "BRL" }).format(v)}
                            tick={{ fill: "#6b7280", fontSize: 9 }}
                            axisLine={false}
                            tickLine={false}
                            width={58}
                        />
                        <Tooltip
                            cursor={{ stroke: "#ffa300", strokeWidth: 1, strokeDasharray: "3 3" }}
                            content={({ active, payload }) => (
                                <FluxoTooltip active={active} payload={payload as any} isAnnual={isAnnual} />
                            )}
                        />

                        {todayInMonth && (
                            <ReferenceLine
                                x={todayInMonth}
                                stroke="#f97316"
                                strokeDasharray="3 3"
                                strokeWidth={1.5}
                                label={{ value: "Hoje", position: "insideTopRight", fill: "#f97316", fontSize: 9 }}
                            />
                        )}

                        <Area
                            type="monotone"
                            dataKey="total"
                            stroke="#ffa300"
                            strokeWidth={2}
                            fill="url(#fluxoGradient)"
                            dot={(props: any) => {
                                const { cx, cy, payload } = props;
                                const isSelected = payload.date === selectedDate;
                                if (!isSelected && payload.total === 0) return <g key={payload.date} />;
                                return (
                                    <circle
                                        key={payload.date}
                                        cx={cx} cy={cy}
                                        r={isSelected ? 5 : payload.total > 0 ? 2.5 : 0}
                                        fill={isSelected ? "#ffa300" : "#ea580c"}
                                        stroke={isSelected ? "#fff" : "none"}
                                        strokeWidth={isSelected ? 1.5 : 0}
                                        style={{ pointerEvents: "none" }}
                                    />
                                );
                            }}
                            activeDot={{ r: 5, fill: "#ffa300", stroke: "#fff", strokeWidth: 1.5 }}
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
