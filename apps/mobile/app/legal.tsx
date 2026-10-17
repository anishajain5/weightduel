import { Text } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Screen, useTheme } from "../components/ui";
import { LEGAL } from "../lib/legal";

export default function Legal() {
  const t = useTheme();
  const { doc } = useLocalSearchParams<{ doc?: string }>();
  const d = doc === "terms" ? LEGAL.terms : LEGAL.privacy;
  return (
    <Screen title={d.title} subtitle="Draft text. Pending legal review before public launch.">
      {d.sections.map(([h, body]) => (
        <Text key={h} style={{ color: t.text, marginBottom: 14, lineHeight: 22 }}>
          <Text style={{ fontWeight: "700" }}>{h}{"\n"}</Text>
          {body}
        </Text>
      ))}
    </Screen>
  );
}
