import { useState } from "react";
import { Text } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { normalizeJoinCode, type GroupDetail, type GroupPreview } from "@wid/shared";
import { Button, ErrorText, Field, Screen, useTheme } from "../components/ui";
import { api, ApiError } from "../lib/api";

export default function Join() {
  const { code: initial } = useLocalSearchParams<{ code?: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const t = useTheme();
  const [code, setCode] = useState(typeof initial === "string" ? normalizeJoinCode(initial) : "");
  const [preview, setPreview] = useState<GroupPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fail = (e: unknown) => setError(e instanceof ApiError ? e.message : "Something went wrong. Try again.");

  const lookup = useMutation({
    mutationFn: () => api<GroupPreview>(`/groups/preview/${normalizeJoinCode(code)}`),
    onSuccess: (p) => { setError(null); setPreview(p); },
    onError: (e) => { setPreview(null); fail(e); },
  });
  const join = useMutation({
    mutationFn: () => api<GroupDetail>("/groups/join", { body: { code: normalizeJoinCode(code) } }),
    onSuccess: async (g) => {
      await qc.invalidateQueries({ queryKey: ["groups"] });
      router.replace({ pathname: "/group/[id]", params: { id: g.id } });
    },
    onError: fail,
  });

  const full = preview ? preview.memberCount >= preview.maxMembers : false;
  return (
    <Screen title="Join a competition">
      <Field label="Join code" value={code} onChangeText={(v) => { setCode(v.toUpperCase()); setPreview(null); }} autoCapitalize="characters" autoCorrect={false} maxLength={7} placeholder="ABC234" />
      <ErrorText>{error}</ErrorText>
      {!preview ? <Button title="Look up" onPress={() => { setError(null); lookup.mutate(); }} busy={lookup.isPending} disabled={code.trim().length < 6} /> : (
        <>
          <Text accessibilityRole="header" style={{ color: t.text, fontSize: 20, fontWeight: "700" }}>{preview.name}</Text>
          <Text style={{ color: t.muted, marginTop: 4, marginBottom: 16 }}>
            Hosted by {preview.ownerName} · {preview.memberCount}/{preview.maxMembers} members · starts {preview.startDate} · scored by {preview.scoring === "pct" ? "% of starting weight" : "weight lost"}
          </Text>
          {preview.status === "ended" ? <Text style={{ color: t.error, marginBottom: 12 }}>This competition has ended.</Text> : null}
          {full && !preview.alreadyMember ? <Text style={{ color: t.error, marginBottom: 12 }}>This competition is full.</Text> : null}
          <Button title={preview.alreadyMember ? "Open" : "Join"} onPress={() => join.mutate()} busy={join.isPending}
            disabled={preview.status === "ended" || (full && !preview.alreadyMember)} />
        </>
      )}
    </Screen>
  );
}
