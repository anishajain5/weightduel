import { useState } from "react";
import { Text, View } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { fromKg, isValidKg, toKg, type ProfileUpdate } from "@wid/shared";
import { Button, ErrorText, Field, Screen, useTheme } from "../components/ui";
import { api, ApiError } from "../lib/api";
import { useProfile } from "../lib/queries";

export default function Onboarding() {
  const t = useTheme();
  const qc = useQueryClient();
  const { data: profile } = useProfile();
  const [step, setStep] = useState(0);
  const [unit, setUnit] = useState<"kg" | "lb">("kg");
  const [startW, setStartW] = useState("");
  const [goalW, setGoalW] = useState("");
  const [reminder, setReminder] = useState("08:00");
  const [error, setError] = useState<string | null>(null);

  const finish = useMutation({
    mutationFn: async () => {
      const num = (s: string) => (s.trim() === "" ? null : parseFloat(s));
      const start = num(startW);
      const goal = num(goalW);
      for (const v of [start, goal]) {
        if (v != null && !isValidKg(toKg(v, unit))) throw new ApiError(0, "VALIDATION", `Weights must be between ${fromKg(25, unit)} and ${fromKg(300, unit)} ${unit}.`);
      }
      if (reminder.trim() !== "" && !/^([01]\d|2[0-3]):[0-5]\d$/.test(reminder.trim())) throw new ApiError(0, "VALIDATION", "Use 24-hour time like 08:00.");
      if (start != null && profile) await api(`/weigh-ins/${profile.today}`, { method: "PUT", body: { weightKg: toKg(start, unit) } });
      const body: ProfileUpdate = {
        unit,
        goalWeightKg: goal != null ? toKg(goal, unit) : null,
        reminderTime: reminder.trim() || null,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        onboarded: true,
      };
      await api("/me", { method: "PATCH", body });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profile"] }),
    onError: (e) => setError(e instanceof ApiError ? e.message : "Couldn't save. Try again."),
  });

  const Chip = ({ v }: { v: "kg" | "lb" }) => (
    <View style={{ flex: 1 }}><Button title={v === "kg" ? "Kilograms (kg)" : "Pounds (lb)"} onPress={() => setUnit(v)} kind={unit === v ? "primary" : "link"} /></View>
  );

  return (
    <Screen title={["Your units", "Your numbers", "Daily reminder"][step]} subtitle={`Step ${step + 1} of 3`}>
      {step === 0 ? (
        <>
          <Text style={{ color: t.muted, marginBottom: 16 }}>Pick how you weigh yourself. You can change this later.</Text>
          <View style={{ flexDirection: "row", gap: 8 }}><Chip v="kg" /><Chip v="lb" /></View>
        </>
      ) : null}
      {step === 1 ? (
        <>
          <Text style={{ color: t.muted, marginBottom: 16 }}>Both are optional. Your start weight is saved as today's entry.</Text>
          <Field label={`Start weight (${unit})`} keyboardType="decimal-pad" value={startW} onChangeText={setStartW} />
          <Field label={`Goal weight (${unit})`} keyboardType="decimal-pad" value={goalW} onChangeText={setGoalW} />
        </>
      ) : null}
      {step === 2 ? (
        <>
          <Text style={{ color: t.muted, marginBottom: 16 }}>We'll nudge you once a day to log. Leave blank for no reminder. You can change this and your notification settings any time in Profile.</Text>
          <Field label="Reminder time (24h, HH:MM)" value={reminder} onChangeText={setReminder} placeholder="08:00" autoCapitalize="none" />
        </>
      ) : null}
      <ErrorText>{error}</ErrorText>
      <Button title={step < 2 ? "Next" : "Finish"} busy={finish.isPending} onPress={() => { setError(null); step < 2 ? setStep(step + 1) : finish.mutate(); }} />
      {step > 0 ? <Button kind="link" title="Back" onPress={() => setStep(step - 1)} /> : null}
    </Screen>
  );
}
