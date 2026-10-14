import { useState } from "react";
import { Text } from "react-native";
import { useRouter } from "expo-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { isValidDateStr, type CreateGroupInput, type GroupDetail } from "@wid/shared";
import { Button, ErrorText, Field, Screen, useTheme } from "../../components/ui";
import { Choice, Toggle } from "../../components/form";
import { api, ApiError } from "../../lib/api";
import { useProfile } from "../../lib/queries";

export default function NewGroup() {
  const router = useRouter();
  const qc = useQueryClient();
  const t = useTheme();
  const { data: profile } = useProfile();
  const [name, setName] = useState("");
  const [start, setStart] = useState(profile?.today ?? "");
  const [end, setEnd] = useState("");
  const [scoring, setScoring] = useState<"pct" | "abs">("pct");
  const [max, setMax] = useState("20");
  const [privacy, setPrivacy] = useState<"pct_only" | "actual">("pct_only");
  const [photos, setPhotos] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new ApiError(0, "VALIDATION", "Give the competition a name.");
      if (!isValidDateStr(start)) throw new ApiError(0, "VALIDATION", "Start date must look like 2026-10-14.");
      if (end.trim() && !isValidDateStr(end.trim())) throw new ApiError(0, "VALIDATION", "End date must look like 2026-12-31, or leave it blank.");
      const m = parseInt(max, 10);
      if (!(m >= 2 && m <= 50)) throw new ApiError(0, "VALIDATION", "Max members must be between 2 and 50.");
      const body: CreateGroupInput = { name: name.trim(), startDate: start, endDate: end.trim() || null, scoring, maxMembers: m, privacy, photosVisible: photos };
      return api<GroupDetail>("/groups", { body });
    },
    onSuccess: async (g) => {
      await qc.invalidateQueries({ queryKey: ["groups"] });
      router.replace({ pathname: "/group/[id]", params: { id: g.id } });
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : "Couldn't create it. Try again."),
  });

  return (
    <Screen title="New competition">
      <Field label="Name (max 40)" value={name} onChangeText={setName} maxLength={40} />
      <Field label="Start date" value={start} onChangeText={setStart} autoCapitalize="none" placeholder="2026-10-14" />
      <Field label="End date (blank = open-ended)" value={end} onChangeText={setEnd} autoCapitalize="none" placeholder="2026-12-31" />
      <Text style={{ color: t.text, fontWeight: "600", marginBottom: 6 }}>Scoring</Text>
      <Choice value={scoring} onChange={setScoring} options={[{ v: "pct", label: "% of start weight" }, { v: "abs", label: "Weight lost" }]} />
      <Field label="Max members" keyboardType="number-pad" value={max} onChangeText={setMax} />
      <Text style={{ color: t.text, fontWeight: "600", marginBottom: 6 }}>What members see</Text>
      <Choice value={privacy} onChange={setPrivacy} options={[{ v: "pct_only", label: "% lost only" }, { v: "actual", label: "Actual weights" }]} />
      <Toggle label="Members can see scale photos" hint="Photos act as proof. Turn off to keep them private." value={photos} onChange={setPhotos} />
      <ErrorText>{error}</ErrorText>
      <Button title="Create" onPress={() => { setError(null); create.mutate(); }} busy={create.isPending} />
    </Screen>
  );
}
