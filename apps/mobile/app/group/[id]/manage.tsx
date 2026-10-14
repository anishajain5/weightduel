import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { isValidDateStr, type GroupDetail, type UpdateGroupInput } from "@wid/shared";
import { Button, ErrorText, Field, Screen, useTheme } from "../../../components/ui";
import { Choice, Toggle } from "../../../components/form";
import { confirm } from "../../../components/confirm";
import { api, ApiError } from "../../../lib/api";
import { useGroup } from "../../../lib/queries";

export default function Manage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const t = useTheme();
  const { data: g } = useGroup(id);
  const [name, setName] = useState("");
  const [end, setEnd] = useState("");
  const [max, setMax] = useState("20");
  const [privacy, setPrivacy] = useState<"pct_only" | "actual">("pct_only");
  const [photos, setPhotos] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!g) return;
    setName(g.name);
    setEnd(g.endDate ?? "");
    setMax(String(g.maxMembers));
    setPrivacy(g.privacy);
    setPhotos(g.photosVisible);
  }, [g]);

  const refresh = () => qc.invalidateQueries({ queryKey: ["group", id] }).then(() => qc.invalidateQueries({ queryKey: ["groups"] }));
  const fail = (e: unknown) => { setSaved(false); setError(e instanceof ApiError ? e.message : "Something went wrong. Try again."); };

  const save = useMutation({
    mutationFn: () => {
      if (end.trim() && !isValidDateStr(end.trim())) throw new ApiError(0, "VALIDATION", "End date must look like 2026-12-31, or be blank.");
      const m = parseInt(max, 10);
      if (!(m >= 2 && m <= 50)) throw new ApiError(0, "VALIDATION", "Max members must be between 2 and 50.");
      const body: UpdateGroupInput = { name: name.trim(), endDate: end.trim() || null, maxMembers: m, privacy, photosVisible: photos };
      return api<GroupDetail>(`/groups/${id}`, { method: "PATCH", body });
    },
    onSuccess: async () => { setError(null); setSaved(true); await refresh(); },
    onError: fail,
  });
  const act = useMutation({
    mutationFn: ({ path, method = "POST", body }: { path: string; method?: "POST" | "DELETE"; body?: unknown }) => api(`/groups/${id}${path}`, { method, body }),
    onSuccess: async () => { setError(null); await refresh(); },
    onError: fail,
  });

  if (!g) return <Screen title="Manage"><Text style={{ color: t.muted }}>Loading…</Text></Screen>;
  const ended = g.status === "ended";

  return (
    <Screen title="Manage" subtitle={g.name}>
      {ended ? <Text style={{ color: t.muted, marginBottom: 12 }}>This competition has ended, so settings are frozen.</Text> : (
        <>
          <Field label="Name" value={name} onChangeText={setName} maxLength={40} />
          <Field label="End date (blank = open-ended)" value={end} onChangeText={setEnd} autoCapitalize="none" placeholder="2026-12-31" />
          <Field label="Max members" keyboardType="number-pad" value={max} onChangeText={setMax} />
          <Text style={{ color: t.text, fontWeight: "600", marginBottom: 6 }}>What members see</Text>
          <Choice value={privacy} onChange={setPrivacy} options={[{ v: "pct_only", label: "% lost only" }, { v: "actual", label: "Actual weights" }]} />
          <Toggle label="Members can see scale photos" value={photos} onChange={setPhotos} />
          {saved ? <Text accessibilityLiveRegion="polite" style={{ color: t.text, marginBottom: 8 }}>Saved ✓</Text> : null}
          <Button title="Save changes" onPress={() => { setError(null); save.mutate(); }} busy={save.isPending} />
          <Button kind="link" title="Generate a new join code" onPress={async () => {
            if (await confirm("New join code?", "The current code and link stop working.", "Generate")) act.mutate({ path: "/regenerate-code" });
          }} />
        </>
      )}
      <ErrorText>{error}</ErrorText>

      <Text accessibilityRole="header" style={{ color: t.text, fontSize: 18, fontWeight: "700", marginTop: 24, marginBottom: 8 }}>Members</Text>
      {g.members.map((m) => (
        <View key={m.userId} style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: t.border }}>
          <Text style={{ color: t.text, fontWeight: "600" }}>{m.displayName}{m.role === "owner" ? " (owner)" : ""}</Text>
          {m.role !== "owner" && !ended ? (
            <View style={{ flexDirection: "row", gap: 8 }}>
              <View style={{ flex: 1 }}><Button kind="link" title="Make owner" onPress={async () => {
                if (await confirm("Transfer ownership?", `${m.displayName} becomes the owner and you become a member.`, "Transfer")) act.mutate({ path: "/transfer", body: { userId: m.userId } });
              }} /></View>
              <View style={{ flex: 1 }}><Button kind="link" title="Remove" onPress={async () => {
                if (await confirm(`Remove ${m.displayName}?`, "They lose access to this competition.", "Remove")) act.mutate({ path: `/members/${m.userId}`, method: "DELETE" });
              }} /></View>
            </View>
          ) : null}
        </View>
      ))}

      {!ended ? (
        <View style={{ marginTop: 24 }}>
          <Button title="End competition now" onPress={async () => {
            if (await confirm("End this competition?", "The leaderboard freezes today and a winner is announced. This can't be undone.", "End it")) {
              act.mutate({ path: "/end" }, { onSuccess: () => router.back() });
            }
          }} busy={act.isPending} />
        </View>
      ) : null}
    </Screen>
  );
}
