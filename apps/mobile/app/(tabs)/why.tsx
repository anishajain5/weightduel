import { useState } from "react";
import { Text } from "react-native";
import { Button, ErrorText, Screen, useTheme } from "../../components/ui";
import { CoachCard, PatternsView } from "../../components/patterns";
import { useProfile, usePatterns } from "../../lib/queries";

export default function WhyScreen() {
  const t = useTheme();
  const [days, setDays] = useState(90);
  const { data: profile } = useProfile();
  const { data, isPending, error, refetch } = usePatterns("/patterns/me", days);
  return (
    <Screen title="Why" subtitle="What your own data says about the weeks that moved and the ones that stalled.">
      <CoachCard />
      {isPending ? <Text style={{ color: t.muted }}>Loading…</Text> : null}
      {error ? (<><ErrorText>Couldn't load your patterns.</ErrorText><Button kind="link" title="Try again" onPress={() => refetch()} /></>) : null}
      {data ? <PatternsView data={data} unit={profile?.unit ?? "kg"} days={days} onDays={setDays} /> : null}
    </Screen>
  );
}
