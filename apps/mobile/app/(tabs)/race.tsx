import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Button, ErrorText, Screen, useTheme } from "../../components/ui";
import { useGroups } from "../../lib/queries";
import { useAuth } from "../../lib/auth";

export default function RaceScreen() {
  const t = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const { data: groups, isPending, error, refetch } = useGroups();
  const unverified = user && !user.emailVerified;

  return (
    <Screen title="Race" subtitle="Compete with friends. Weigh-ins are yours; every group you're in shares the same log.">
      {unverified ? <Text style={{ color: t.muted, marginBottom: 12 }}>Verify your email to create or join a competition.</Text> : null}
      <Button title="Create a competition" onPress={() => router.push("/group/new")} disabled={!!unverified} />
      <Button kind="link" title="Join with a code" onPress={() => router.push("/join")} disabled={!!unverified} />

      <Text accessibilityRole="header" style={{ color: t.text, fontSize: 18, fontWeight: "700", marginTop: 24, marginBottom: 10 }}>Your competitions</Text>
      {isPending ? <Text style={{ color: t.muted }}>Loading…</Text> : null}
      {error ? (
        <>
          <ErrorText>Couldn't load your competitions.</ErrorText>
          <Button kind="link" title="Try again" onPress={() => refetch()} />
        </>
      ) : null}
      {groups?.length === 0 ? <Text style={{ color: t.muted }}>None yet. Create one, or ask a friend for their code.</Text> : null}
      {groups?.map((g) => (
        <Pressable key={g.id} accessibilityRole="button" accessibilityLabel={`${g.name}, ${g.memberCount} members, ${g.status}`}
          onPress={() => router.push({ pathname: "/group/[id]", params: { id: g.id } })}
          style={{ borderWidth: 1, borderColor: t.border, borderRadius: 12, padding: 14, marginBottom: 10 }}>
          <Text style={{ color: t.text, fontSize: 17, fontWeight: "600" }}>{g.name}</Text>
          <Text style={{ color: t.muted, marginTop: 2 }}>
            {g.memberCount} {g.memberCount === 1 ? "member" : "members"} · {g.status === "ended" ? "Ended" : g.endDate ? `ends ${g.endDate}` : "open-ended"}{g.role === "owner" ? " · you own this" : ""}
          </Text>
        </Pressable>
      ))}
      <View style={{ height: 24 }} />
    </Screen>
  );
}
