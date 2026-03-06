"use client";

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

export interface ChartDataPoint {
    date: string;   // "DD/MM" display label
    value: number;  // monetary value (can be negative)
    isFuture: boolean;
}

interface CustomTooltipProps {
    active?: boolean;
    payload?: { value: number }[];
    label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
    if (!active || !payload?.length) return null;
    const value = payload[0].value;
    return (
        <div className="rounded-xl bg-black/90 border border-white/10 px-3 py-2 shadow-xl text-xs">
            <p className="text-gray-400 mb-1">{label}</p>
            <p
                className="font-bold"
                style={{ color: value < 0 ? "#f87171" : "#f97316" }}
            >
                {new Intl.NumberFormat("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                }).format(Math.abs(value))}
            </p>
        </div>
    );
}

export default function RecebimentosChart({ data }: { data: ChartDataPoint[] }) {
    // Find the last non-future bar to position the "Hoje" reference line
    let todayIdx = -1;
    for (let i = data.length - 1; i >= 0; i--) {
        if (!data[i].isFuture) { todayIdx = i; break; }
    }
    const todayLabel = todayIdx >= 0 ? data[todayIdx]?.date : undefined;

    return (
        <ResponsiveContainer width="100%" height={200}>
            <BarChart
                data={data}
                margin={{ top: 8, right: 4, left: 0, bottom: 0 }}
                barCategoryGap="30%"
            >
                <CartesianGrid
                    vertical={false}
                    stroke="rgba(255,255,255,0.05)"
                    strokeDasharray="4 4"
                />
                <XAxis
                    dataKey="date"
                    tick={{ fill: "#6b7280", fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
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
                <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />

                {todayLabel && (
                    <ReferenceLine
                        x={todayLabel}
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

                <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={28}>
                    {data.map((entry, index) => (
                        <Cell
                            key={`cell-${index}`}
                            fill={
                                entry.value < 0
                                    ? "#ef4444"          // red for negative
                                    : entry.isFuture
                                        ? "#f97316"          // bright orange for future
                                        : "#fb923c"          // lighter orange for past
                            }
                            opacity={entry.isFuture ? 0.75 : 1}
                        />
                    ))}
                </Bar>
            </BarChart>
        </ResponsiveContainer>
    );
}
