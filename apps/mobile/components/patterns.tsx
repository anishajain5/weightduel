import { useState } from "react";
import { Text, View, type LayoutChangeEvent } from "react-native";
import Svg, { Circle, G, Line, Polyline, Rect, Text as SvgText } from "react-native-svg";
import { daysBetween, fromKg, scoreBand, type HabitRow, type PatternsResponse, type Unit, type WeekRow } from "@wid/shared";
import { Button, ErrorText, useTheme } from "./ui";
import { apiStream, ApiError } from "../lib/api";

const BAND = { good: "#16a34a", mid: "#d97706", poor: "#dc2626" } as const;
const PAD = { l: 40, r: 28, t: 10, b: 24 };

/** Weight line (left axis) over daily habit-score bars (right axis, 0-5). */
export function OverlayChart({ days, from, to, unit, height = 230 }: { days: PatternsResponse["days"]; from: string; to: string; unit: Unit; height?: number }) {
  const t = useTheme();
  const [w, setW] = useState(0);
  const span = Math.max(1, daysBetween(from, to));
  const pts = days.filter((d) => d.weightKg !== null).map((d) => ({ date: d.date, v: fromKg(d.weightKg!, unit) }));
  let lo = pts.length ? Math.min(...pts.map((p) => p.v)) : 0;
  let hi = pts.length ? Math.max(...pts.map((p) => p.v)) : 1;
  if (hi - lo < 1) { lo -= 0.5; hi += 0.5; }
  const pad = (hi - lo) * 0.1;
  lo -= pad; hi += pad;
  const iw = Math.max(0, w - PAD.l - PAD.r);
  const ih = height - PAD.t - PAD.b;
  const X = (d: string) => PAD.l + (daysBetween(from, d) / span) * iw;
  const Yw = (v: number) => PAD.t + (1 - (v - lo) / (hi - lo)) * ih;
  const Ys = (s: number) => PAD.t + (1 - s / 5) * ih;
  const barW = Math.max(2, Math.min(14, (iw / (span + 1)) * 0.7));
  const ticks = [0, 1, 2, 3].map((i) => lo + ((hi - lo) * i) / 3);
  const scored = days.filter((d) => d.score !== null);
  const label = `Weight and habit score chart. ${pts.length} weigh-ins, ${scored.length} scored days.`;

  return (
    <View onLayout={(e: LayoutChangeEvent) => setW(Math.round(e.nativeEvent.layout.width))} accessible accessibilityRole="image" accessibilityLabel={label}>
      {w > 0 ? (
        <Svg width={w} height={height}>
          {ticks.map((v) => (
            <G key={v}>
              <Line x1={PAD.l} x2={w - PAD.r} y1={Yw(v)} y2={Yw(v)} stroke={t.border} strokeWidth={1} />
              <SvgText x={PAD.l - 6} y={Yw(v) + 4} fontSize={10} fill={t.muted} textAnchor="end">{Math.round(v * 10) / 10}</SvgText>
            </G>
          ))}
          {[0, 5].map((s) => <SvgText key={s} x={w - PAD.r + 6} y={Ys(s) + 4} fontSize={10} fill={t.muted}>{s}</SvgText>)}
          {scored.map((d) => (
            <Rect key={d.date} x={X(d.date) - barW / 2} y={Ys(d.score!)} width={barW} height={Math.max(1, Ys(0) - Ys(d.score!))} fill={BAND[scoreBand(d.score!)]} opacity={0.45} />
          ))}
          {pts.length > 1 ? <Polyline points={pts.map((p) => `${X(p.date)},${Yw(p.v)}`).join(" ")} fill="none" stroke={t.text} strokeWidth={2.5} strokeLinejoin="round" /> : null}
          {pts.map((p) => <Circle key={p.date} cx={X(p.date)} cy={Yw(p.v)} r={3} fill={t.text} />)}
          <SvgText x={PAD.l} y={height - 6} fontSize={10} fill={t.muted}>{from.slice(5)}</SvgText>
          <SvgText x={w - PAD.r} y={height - 6} fontSize={10} fill={t.muted} textAnchor="end">{to.slice(5)}</SvgText>
        </Svg>
      ) : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 6 }}>
        <Text style={{ color: t.text, fontSize: 12 }}>━ Weight ({unit}, left)</Text>
        <Text style={{ color: BAND.good, fontSize: 12 }}>▮ Score 4–5</Text>
        <Text style={{ color: BAND.mid, fontSize: 12 }}>▮ 2–3</Text>
        <Text style={{ color: BAND.poor, fontSize: 12 }}>▮ 0–1 (right axis)</Text>
      </View>
    </View>
  );
}

const verdictText = (h: HabitRow, unit: Unit) =>
  h.verdict === "good" ? `Worth ${Math.abs(fromKg(h.gapKgPerWeek!, unit))} ${unit}/wk`
  : h.verdict === "small" ? "Small effect"
  : h.verdict === "none" ? "No link yet"
  : "Need more days";

function Row({ cells, header }: { cells: string[]; header?: boolean }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: "row", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: t.border }}>
      {cells.map((c, i) => (
        <Text key={i} style={{ flex: i === 0 ? 2 : 1, color: header ? t.muted : t.text, fontSize: header ? 12 : 14, fontWeight: header || i === 0 ? "600" : "400", textAlign: i === 0 ? "left" : "right" }}>{c}</Text>
      ))}
    </View>
  );
}

export function HabitTable({ habits, unit }: { habits: HabitRow[]; unit: Unit }) {
  const t = useTheme();
  const delta = (kgPerDay: number | null) => (kgPerDay === null ? "–" : `${kgPerDay > 0 ? "+" : ""}${fromKg(kgPerDay, unit)}`);
  return (
    <View>
      <Row header cells={["Habit", "Hit rate", `Did (${unit}/day)`, `Skipped`]} />
      {habits.map((h) => (
        <View key={h.habit} accessible accessibilityLabel={`${h.label}: hit rate ${h.hitRate === null ? "none" : Math.round(h.hitRate * 100) + " percent"}. ${verdictText(h, unit)}`}>
          <Row cells={[h.label, h.hitRate === null ? "–" : `${Math.round(h.hitRate * 100)}%`, delta(h.avgDid), delta(h.avgSkipped)]} />
          <Text style={{ color: h.verdict === "good" ? BAND.good : t.muted, fontSize: 12, fontWeight: "600", paddingVertical: 4 }}>
            {h.verdict === "good" ? "✓ " : ""}{verdictText(h, unit)}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function WeekTable({ weeks, unit }: { weeks: WeekRow[]; unit: Unit }) {
  return (
    <View>
      <Row header cells={["Week of", "Days", "Consistency", "Change"]} />
      {[...weeks].reverse().map((w) => (
        <Row key={w.weekStart} cells={[w.weekStart.slice(5), String(w.daysLogged), w.consistency === null ? "–" : `${Math.round(w.consistency * 100)}%`,
          w.changeKg === null ? "–" : `${w.changeKg > 0 ? "+" : ""}${fromKg(w.changeKg, unit)} ${unit}`]} />
      ))}
    </View>
  );
}

export function PatternsView({ data, unit, days, onDays }: { data: PatternsResponse; unit: Unit; days: number; onDays(d: number): void }) {
  const t = useTheme();
  const H = ({ children }: { children: string }) => (
    <Text accessibilityRole="header" style={{ color: t.text, fontSize: 18, fontWeight: "700", marginTop: 24, marginBottom: 8 }}>{children}</Text>
  );
  return (
    <View>
      <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
        {[30, 90, 180].map((d) => <View key={d} style={{ flex: 1 }}><Button title={`${d} days`} kind={days === d ? "primary" : "link"} onPress={() => onDays(d)} /></View>)}
      </View>
      {data.daysLogged < 3 ? <Text style={{ color: t.muted, marginBottom: 12 }}>Only {data.daysLogged} {data.daysLogged === 1 ? "day" : "days"} logged in this range. Patterns get useful after a couple of weeks.</Text> : null}
      <OverlayChart days={data.days} from={data.from} to={data.to} unit={unit} />
      <H>Habit by habit</H>
      <Text style={{ color: t.muted, fontSize: 12, marginBottom: 4 }}>Average daily weight change after days you did the habit vs skipped it. Daily swings of 0.5–1 kg are normal water noise.</Text>
      <HabitTable habits={data.habits} unit={unit} />
      <H>Week by week</H>
      <WeekTable weeks={data.weeks} unit={unit} />
    </View>
  );
}

/** "Why aren't we losing?" - streams the coach's read of your last 45 days. */
export function CoachCard() {
  const t = useTheme();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cached, setCached] = useState(false);

  const ask = async () => {
    setBusy(true); setError(null); setText(""); setCached(false);
    try {
      await apiStream("/ai/coach", (e) => {
        if (e.t === "delta") setText((x) => x + (e.text ?? ""));
        else if (e.t === "done") setCached(!!e.cached);
        else if (e.t === "error") setError(e.message ?? "The coach couldn't finish.");
      });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't reach the coach. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ borderWidth: 1, borderColor: t.border, borderRadius: 14, padding: 16, marginBottom: 8 }}>
      <Text accessibilityRole="header" style={{ color: t.text, fontSize: 18, fontWeight: "700", marginBottom: 4 }}>Why aren't we losing?</Text>
      <Text style={{ color: t.muted, fontSize: 13, marginBottom: 10 }}>The coach reads your last 45 days (weights, habits, mood and notes) and points at what lines up with stalls.</Text>
      {text ? <Text accessibilityLiveRegion="polite" style={{ color: t.text, lineHeight: 22, marginBottom: 10 }}>{text}</Text> : null}
      <ErrorText>{error}</ErrorText>
      <Button title={text ? "Ask again" : "Ask the coach"} onPress={ask} busy={busy} />
      {cached && text ? <Text style={{ color: t.muted, fontSize: 12, marginTop: 6 }}>Nothing new since your last read.</Text> : null}
      <Text style={{ color: t.muted, fontSize: 12, marginTop: 6 }}>AI-generated from your own data. Not medical advice.</Text>
    </View>
  );
}
