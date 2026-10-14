import { useEffect, useState } from "react";
import { Image, Text, TextInput, View } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { fromKg, isValidKg, MAX_KG, MIN_KG, toKg, todayInTz, type ScaleReadResponse, type WeighInInput } from "@wid/shared";
import { Button, ErrorText, Screen, useTheme } from "../../components/ui";
import { DateStepper, Keypad, Lcd, MoodPicker, Stat, TriToggle } from "../../components/log";
import { api, ApiError } from "../../lib/api";
import { pickAndUploadPhoto } from "../../lib/photo";
import { useProfile, useWeighIn } from "../../lib/queries";

export default function LogScreen() {
  const t = useTheme();
  const qc = useQueryClient();
  const { data: profile } = useProfile();
  const today = profile?.today ?? todayInTz(Intl.DateTimeFormat().resolvedOptions().timeZone);
  const unit = profile?.unit ?? "kg";

  const [date, setDate] = useState(today);
  const { data: existing, isFetching } = useWeighIn(date);

  const [weight, setWeight] = useState("");
  const [flags, setFlags] = useState<Record<"ate" | "moved" | "slept" | "intent", boolean | null>>({ ate: null, moved: null, slept: null, intent: null });
  const [mood, setMood] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [photo, setPhoto] = useState<{ key: string; uri: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [reading, setReading] = useState<{ value: number; low: boolean } | "none" | "reading" | null>(null);

  // Load the saved entry whenever the date (or its data) changes.
  useEffect(() => {
    if (isFetching) return;
    setWeight(existing?.weightKg != null ? String(fromKg(existing.weightKg, unit)) : "");
    setFlags({ ate: existing?.ate ?? null, moved: existing?.moved ?? null, slept: existing?.slept ?? null, intent: existing?.intent ?? null });
    setMood(existing?.mood ?? null);
    setNotes(existing?.notes ?? "");
    setPhoto(existing?.photoKey ? { key: existing.photoKey, uri: existing.photoUrl } : null);
    setError(null);
    setSaved(false);
  }, [existing, isFetching, date, unit]);

  const save = useMutation({
    mutationFn: async () => {
      let weightKg: number | null = null;
      if (weight !== "") {
        const kg = toKg(parseFloat(weight), unit);
        if (!isValidKg(kg)) {
          throw new ApiError(0, "VALIDATION", `Enter a weight between ${fromKg(MIN_KG, unit)} and ${fromKg(MAX_KG, unit)} ${unit}`);
        }
        weightKg = kg;
      }
      const body: WeighInInput = { weightKg, photoKey: photo?.key ?? null, ...flags, mood, notes: notes.trim() || null };
      await api(`/weigh-ins/${date}`, { method: "PUT", body });
    },
    onSuccess: async () => {
      setError(null);
      setSaved(true);
      await Promise.all([qc.invalidateQueries({ queryKey: ["weighIn"] }), qc.invalidateQueries({ queryKey: ["profile"] })]);
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : "Couldn't save. Check your connection and try again."),
  });

  const remove = useMutation({
    mutationFn: () => api(`/weigh-ins/${date}`, { method: "DELETE" }),
    onSuccess: async () => {
      await Promise.all([qc.invalidateQueries({ queryKey: ["weighIn"] }), qc.invalidateQueries({ queryKey: ["profile"] })]);
    },
  });

  /** AI scale reader: only suggests a number; the user taps "Use" to confirm. Failures are silent (typing still works). */
  const readScale = async (key: string) => {
    setReading("reading");
    try {
      const r = await api<ScaleReadResponse>("/ai/scale-read", { body: { photoKey: key } });
      setReading(r.weightInUserUnit === null ? "none" : { value: r.weightInUserUnit, low: r.confidence === "low" });
    } catch {
      setReading(null);
    }
  };

  const addPhoto = async (source: "camera" | "library") => {
    setUploading(true);
    setError(null);
    try {
      const p = await pickAndUploadPhoto(source);
      if (p) {
        setPhoto({ key: p.key, uri: p.localUri });
        setSaved(false);
        void readScale(p.key);
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't add that photo.");
    } finally {
      setUploading(false);
    }
  };

  const start = profile?.startWeightKg ?? null;
  const current = weight !== "" ? toKg(parseFloat(weight) || 0, unit) : existing?.weightKg ?? null;
  const change = start != null && current ? Math.round((fromKg(current, unit) - fromKg(start, unit)) * 10) / 10 : null;
  const fmt = (kg: number | null | undefined) => (kg == null ? "–" : `${fromKg(kg, unit)} ${unit}`);

  return (
    <Screen title="Daily log">
      <DateStepper date={date} today={today} onChange={setDate} />
      <Lcd value={weight} unit={unit} />
      <Keypad value={weight} onChange={(v) => { setWeight(v); setSaved(false); }} />

      <View style={{ flexDirection: "row", marginBottom: 16 }}>
        <Stat label="Start" value={fmt(start)} />
        <Stat label="Goal" value={fmt(profile?.goalWeightKg)} />
        <Stat label="Change" value={change == null ? "–" : `${change > 0 ? "+" : ""}${change} ${unit}`} />
        <Stat label="Streak" value={`${profile?.streak ?? 0}d`} />
      </View>

      <View style={{ marginBottom: 16 }}>
        <Text style={{ color: t.text, fontWeight: "600", marginBottom: 8 }}>Scale photo</Text>
        {photo?.uri ? <Image accessibilityLabel="Scale photo" source={{ uri: photo.uri }} style={{ width: "100%", height: 160, borderRadius: 10, marginBottom: 8 }} resizeMode="cover" /> : null}
        <View style={{ flexDirection: "row", gap: 8 }}>
          <View style={{ flex: 1 }}><Button title="Camera" onPress={() => addPhoto("camera")} busy={uploading} /></View>
          <View style={{ flex: 1 }}><Button title="Library" onPress={() => addPhoto("library")} busy={uploading} /></View>
        </View>
        {reading === "reading" ? <Text accessibilityLiveRegion="polite" style={{ color: t.muted, marginTop: 8 }}>Reading the scale…</Text> : null}
        {reading === "none" ? <Text accessibilityLiveRegion="polite" style={{ color: t.muted, marginTop: 8 }}>Couldn't read a number from that photo. Type your weight instead.</Text> : null}
        {reading && typeof reading === "object" ? (
          <View accessibilityLiveRegion="polite" style={{ borderWidth: 1, borderColor: t.border, borderRadius: 10, padding: 12, marginTop: 8 }}>
            <Text style={{ color: t.text, fontWeight: "600" }}>I read {reading.value} {unit}</Text>
            {reading.low ? <Text style={{ color: t.muted, fontSize: 13 }}>Best guess, check before saving</Text> : null}
            <Button title={`Use ${reading.value} ${unit}`} onPress={() => { setWeight(String(reading.value)); setReading(null); setSaved(false); }} />
            <Button kind="link" title="No, I'll type it" onPress={() => setReading(null)} />
          </View>
        ) : null}
        {photo ? <Button kind="link" title="Remove photo" onPress={() => { setPhoto(null); setReading(null); setSaved(false); }} /> : null}
      </View>

      <Text style={{ color: t.text, fontWeight: "600", marginBottom: 10 }}>How was your day? (optional)</Text>
      <TriToggle label="Ate healthy?" value={flags.ate} onChange={(v) => setFlags({ ...flags, ate: v })} />
      <TriToggle label="Exercised?" value={flags.moved} onChange={(v) => setFlags({ ...flags, moved: v })} />
      <TriToggle label="Slept well?" value={flags.slept} onChange={(v) => setFlags({ ...flags, slept: v })} />
      <TriToggle label="Intentional about choices?" value={flags.intent} onChange={(v) => setFlags({ ...flags, intent: v })} />
      <View style={{ marginVertical: 8 }}><MoodPicker value={mood} onChange={setMood} /></View>

      <Text style={{ color: t.text, fontSize: 15, marginTop: 8, marginBottom: 6 }}>Notes (private, never shown to your group)</Text>
      <TextInput accessibilityLabel="Notes" multiline maxLength={500} value={notes} onChangeText={setNotes}
        style={{ borderWidth: 1, borderColor: t.border, borderRadius: 10, padding: 12, minHeight: 80, color: t.text, marginBottom: 4, textAlignVertical: "top" }} />
      <Text style={{ color: t.muted, fontSize: 12, textAlign: "right", marginBottom: 12 }}>{notes.length}/500</Text>

      <ErrorText>{error}</ErrorText>
      {saved ? <Text accessibilityLiveRegion="polite" style={{ color: t.text, marginBottom: 8 }}>Saved ✓</Text> : null}
      <Button title={existing ? "Update entry" : "Save"} onPress={() => save.mutate()} busy={save.isPending} />
      {existing ? <Button kind="link" title="Delete this entry" onPress={() => remove.mutate()} busy={remove.isPending} /> : null}
    </Screen>
  );
}
