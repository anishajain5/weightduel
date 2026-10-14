import { useState } from "react";
import { Text } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { ApiError } from "../../../lib/api";
import { ErrorText, Screen, useTheme } from "../../../components/ui";
import { PatternsView } from "../../../components/patterns";
import { useProfile, usePatterns } from "../../../lib/queries";

export default function MemberPatterns() {
  const { groupId, userId } = useLocalSearchParams<{ groupId: string; userId: string }>();
  const t = useTheme();
  const [days, setDays] = useState(90);
  const { data: profile } = useProfile();
  const { data, isPending, error } = usePatterns(`/patterns/${groupId}/${userId}`, days);
  return (
    <Screen title={data ? `${data.displayName}'s patterns` : "Patterns"}>
      {isPending ? <Text style={{ color: t.muted }}>Loading…</Text> : null}
      {error ? <ErrorText>{error instanceof ApiError ? error.message : "Couldn't load patterns."}</ErrorText> : null}
      {data ? <PatternsView data={data} unit={profile?.unit ?? "kg"} days={days} onDays={setDays} /> : null}
    </Screen>
  );
}
