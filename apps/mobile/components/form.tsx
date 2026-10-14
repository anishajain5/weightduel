import { Switch, Text, View } from "react-native";
import { Button, useTheme } from "./ui";

export function Toggle({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange(v: boolean): void }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 }}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: t.text, fontWeight: "600" }}>{label}</Text>
        {hint ? <Text style={{ color: t.muted, fontSize: 13 }}>{hint}</Text> : null}
      </View>
      <Switch accessibilityLabel={label} value={value} onValueChange={onChange} />
    </View>
  );
}

export function Choice<T extends string>({ value, options, onChange }: { value: T; options: { v: NoInfer<T>; label: string }[]; onChange(v: NoInfer<T>): void }) {
  return (
    <View style={{ flexDirection: "row", gap: 8, marginBottom: 14 }}>
      {options.map((o) => (
        <View key={o.v} style={{ flex: 1 }}><Button title={o.label} kind={value === o.v ? "primary" : "link"} onPress={() => onChange(o.v)} /></View>
      ))}
    </View>
  );
}
