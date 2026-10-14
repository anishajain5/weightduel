import { useState } from "react";
import { Text, View, type LayoutChangeEvent } from "react-native";
import Svg, { Circle, G, Line, Polyline, Text as SvgText } from "react-native-svg";
import { daysBetween } from "@wid/shared";
import { useTheme } from "./ui";

export const PALETTE = ["#2563eb", "#dc2626", "#16a34a", "#d97706", "#9333ea", "#0891b2", "#db2777", "#65a30d", "#475569", "#ea580c"];

export interface ChartLine {
  id: string;
  label: string;
  color: string;
  bold?: boolean;
  points: { date: string; value: number }[];
}

const PAD = { l: 44, r: 12, t: 10, b: 24 };

/** Multi-line chart on react-native-svg (works the same on iOS, Android and web). */
export function LineChart({ lines, from, to, format, height = 220 }: {
  lines: ChartLine[]; from: string; to: string; format: (v: number) => string; height?: number;
}) {
  const t = useTheme();
  const [w, setW] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setW(Math.round(e.nativeEvent.layout.width));

  const all = lines.flatMap((l) => l.points);
  const dates = [from, to, ...all.map((p) => p.date)].sort();
  const x0 = dates[0]!;
  const spanDays = Math.max(1, daysBetween(x0, dates[dates.length - 1]!));
  const vals = all.map((p) => p.value);
  let lo = vals.length ? Math.min(...vals) : 0;
  let hi = vals.length ? Math.max(...vals) : 1;
  if (hi - lo < 0.5) { lo -= 0.5; hi += 0.5; }
  const padV = (hi - lo) * 0.1;
  lo -= padV; hi += padV;

  const iw = Math.max(0, w - PAD.l - PAD.r);
  const ih = height - PAD.t - PAD.b;
  const X = (d: string) => PAD.l + (daysBetween(x0, d) / spanDays) * iw;
  const Y = (v: number) => PAD.t + (1 - (v - lo) / (hi - lo)) * ih;
  const ticks = [0, 1, 2, 3].map((i) => lo + ((hi - lo) * i) / 3);
  const short = (d: string) => d.slice(5);

  const summary = lines.map((l) => `${l.label}: ${l.points.length ? format(l.points[l.points.length - 1]!.value) : "no data yet"}`).join(". ");

  return (
    <View onLayout={onLayout} accessible accessibilityRole="image" accessibilityLabel={`Race chart. ${summary}`}>
      {w > 0 ? (
        <Svg width={w} height={height}>
          {ticks.map((v) => (
            <G key={v}>
              <Line x1={PAD.l} x2={w - PAD.r} y1={Y(v)} y2={Y(v)} stroke={t.border} strokeWidth={1} />
              <SvgText x={PAD.l - 6} y={Y(v) + 4} fontSize={10} fill={t.muted} textAnchor="end">{format(v)}</SvgText>
            </G>
          ))}
          <SvgText x={PAD.l} y={height - 6} fontSize={10} fill={t.muted} textAnchor="start">{short(x0)}</SvgText>
          <SvgText x={w - PAD.r} y={height - 6} fontSize={10} fill={t.muted} textAnchor="end">{short(dates[dates.length - 1]!)}</SvgText>
          {lines.map((l) =>
            l.points.length > 1 ? (
              <Polyline key={l.id} points={l.points.map((p) => `${X(p.date)},${Y(p.value)}`).join(" ")} fill="none"
                stroke={l.color} strokeWidth={l.bold ? 3.5 : 2} strokeLinejoin="round" strokeLinecap="round" />
            ) : null,
          )}
          {lines.flatMap((l) => l.points.map((p) => <Circle key={`${l.id}${p.date}`} cx={X(p.date)} cy={Y(p.value)} r={l.bold ? 4 : 3} fill={l.color} />))}
        </Svg>
      ) : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 8 }}>
        {lines.map((l) => (
          <View key={l.id} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: l.color }} />
            <Text style={{ color: t.text, fontSize: 13, fontWeight: l.bold ? "700" : "400" }}>
              {l.label}{l.points.length ? ` ${format(l.points[l.points.length - 1]!.value)}` : ""}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
