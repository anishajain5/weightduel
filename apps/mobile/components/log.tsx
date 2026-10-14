import { Pressable, StyleSheet, Text, View } from "react-native";
import { addDays } from "@wid/shared";
import { useTheme } from "./ui";

/** Day stepper: can't pass today, can't go back more than 14 days. */
export function DateStepper({ date, today, onChange }: { date: string; today: string; onChange(d: string): void }) {
  const t = useTheme();
  const canBack = date > addDays(today, -14);
  const canFwd = date < today;
  const label = date === today ? "Today" : date === addDays(today, -1) ? "Yesterday" : date;
  const Btn = ({ glyph, name, ok, to }: { glyph: string; name: string; ok: boolean; to: string }) => (
    <Pressable accessibilityRole="button" accessibilityLabel={name} accessibilityState={{ disabled: !ok }} disabled={!ok}
      onPress={() => onChange(to)} style={[s.step, { borderColor: t.border, opacity: ok ? 1 : 0.35 }]}>
      <Text style={{ color: t.text, fontSize: 20 }}>{glyph}</Text>
    </Pressable>
  );
  return (
    <View style={s.row}>
      <Btn glyph="‹" name="Previous day" ok={canBack} to={addDays(date, -1)} />
      <View style={{ alignItems: "center" }}>
        <Text accessibilityRole="header" style={{ color: t.text, fontSize: 18, fontWeight: "600" }}>{label}</Text>
        {label !== date ? <Text style={{ color: t.muted, fontSize: 12 }}>{date}</Text> : null}
      </View>
      <Btn glyph="›" name="Next day" ok={canFwd} to={addDays(date, 1)} />
    </View>
  );
}

/** LCD-style readout. */
export function Lcd({ value, unit }: { value: string; unit: string }) {
  return (
    <View accessible accessibilityRole="text" accessibilityLabel={value ? `Weight ${value} ${unit}` : "No weight entered"} style={s.lcd}>
      <Text style={s.lcdText}>{value || "--.-"}</Text>
      <Text style={s.lcdUnit}>{unit}</Text>
    </View>
  );
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "⌫"];

/** On-screen numeric keypad: identical on iOS, Android and web. */
export function Keypad({ value, onChange }: { value: string; onChange(v: string): void }) {
  const t = useTheme();
  const press = (k: string) => {
    if (k === "⌫") return onChange(value.slice(0, -1));
    if (k === ".") return value.includes(".") ? undefined : onChange(value === "" ? "0." : value + ".");
    const dot = value.indexOf(".");
    if (dot >= 0 && value.length - dot > 1) return; // one decimal place
    if (value.replace(".", "").length >= 4) return;
    onChange(value === "0" ? k : value + k);
  };
  return (
    <View style={s.pad}>
      {KEYS.map((k) => (
        <Pressable key={k} accessibilityRole="button" accessibilityLabel={k === "⌫" ? "Delete" : k === "." ? "Decimal point" : k}
          onPress={() => press(k)} style={[s.key, { borderColor: t.border }]}>
          <Text style={{ color: t.text, fontSize: 22 }}>{k}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/** Yes / No / unset. The label text carries the state, not just colour. */
export function TriToggle({ label, value, onChange }: { label: string; value: boolean | null; onChange(v: boolean | null): void }) {
  const t = useTheme();
  const opt = (name: string, v: boolean) => {
    const on = value === v;
    return (
      <Pressable accessibilityRole="radio" accessibilityLabel={`${label}: ${name}`} accessibilityState={{ selected: on }}
        onPress={() => onChange(on ? null : v)}
        style={[s.opt, { borderColor: t.border }, on && { backgroundColor: t.primary }]}>
        <Text style={{ color: on ? t.onPrimary : t.text, fontWeight: "600" }}>{name}</Text>
      </Pressable>
    );
  };
  return (
    <View style={s.triRow}>
      <Text style={{ color: t.text, flex: 1, fontSize: 15 }}>{label}</Text>
      {opt("Yes", true)}
      {opt("No", false)}
    </View>
  );
}

const MOODS = ["Low", "Meh", "Okay", "Good", "Great"];
export function MoodPicker({ value, onChange }: { value: number | null; onChange(v: number | null): void }) {
  const t = useTheme();
  return (
    <View>
      <Text style={{ color: t.text, fontSize: 15, marginBottom: 8 }}>Mood</Text>
      <View style={{ flexDirection: "row", gap: 6 }}>
        {MOODS.map((m, i) => {
          const on = value === i + 1;
          return (
            <Pressable key={m} accessibilityRole="radio" accessibilityLabel={`Mood: ${m}`} accessibilityState={{ selected: on }}
              onPress={() => onChange(on ? null : i + 1)}
              style={[s.mood, { borderColor: t.border }, on && { backgroundColor: t.primary }]}>
              <Text style={{ color: on ? t.onPrimary : t.text, fontSize: 12, fontWeight: "600" }}>{m}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function Stat({ label, value }: { label: string; value: string }) {
  const t = useTheme();
  return (
    <View style={{ alignItems: "center", flex: 1 }}>
      <Text style={{ color: t.muted, fontSize: 12 }}>{label}</Text>
      <Text style={{ color: t.text, fontSize: 17, fontWeight: "600" }}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  step: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  lcd: { backgroundColor: "#1c2a1c", borderRadius: 14, paddingVertical: 18, paddingHorizontal: 20, flexDirection: "row", alignItems: "baseline", justifyContent: "center", gap: 8, marginBottom: 12 },
  lcdText: { color: "#a6f3a6", fontSize: 56, fontWeight: "700", fontVariant: ["tabular-nums"] },
  lcdUnit: { color: "#7fc57f", fontSize: 20, fontWeight: "600" },
  pad: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
  key: { width: "31.5%", minHeight: 52, borderWidth: 1, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  triRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  opt: { minWidth: 64, minHeight: 44, borderWidth: 1, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  mood: { flex: 1, minHeight: 44, borderWidth: 1, borderRadius: 10, alignItems: "center", justifyContent: "center" },
});
