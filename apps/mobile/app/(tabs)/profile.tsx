import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { fromKg, isValidKg, isValidTimezone, toKg, type AuthResponse, type ProfileUpdate } from "@wid/shared";
import { Button, ErrorText, Field, Screen, useTheme } from "../../components/ui";
import { useAuth } from "../../lib/auth";
import { api, ApiError } from "../../lib/api";
import { useProfile } from "../../lib/queries";

export default function ProfileScreen() {
  const { user, logout, adoptSession } = useAuth();
  const t = useTheme();
  const router = useRouter();
  const qc = useQueryClient();
  const { data: p } = useProfile();

  const [name, setName] = useState("");
  const [unit, setUnit] = useState<"kg" | "lb">("kg");
  const [goal, setGoal] = useState("");
  const [height, setHeight] = useState("");
  const [reminder, setReminder] = useState("");
  const [tz, setTz] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!p) return;
    setName(p.displayName);
    setUnit(p.unit);
    setGoal(p.goalWeightKg != null ? String(fromKg(p.goalWeightKg, p.unit)) : "");
    setHeight(p.heightCm != null ? String(p.heightCm) : "");
    setReminder(p.reminderTime ?? "");
    setTz(p.timezone);
  }, [p]);

  const save = useMutation({
    mutationFn: async () => {
      const g = goal.trim() === "" ? null : parseFloat(goal);
      if (g != null && !isValidKg(toKg(g, unit))) throw new ApiError(0, "VALIDATION", "Goal weight is out of range.");
      const h = height.trim() === "" ? null : parseFloat(height);
      if (h != null && (!(h >= 90) || !(h <= 250))) throw new ApiError(0, "VALIDATION", "Height must be 90–250 cm.");
      if (reminder.trim() !== "" && !/^([01]\d|2[0-3]):[0-5]\d$/.test(reminder.trim())) throw new ApiError(0, "VALIDATION", "Reminder must look like 08:00.");
      if (!isValidTimezone(tz.trim())) throw new ApiError(0, "VALIDATION", "Unknown time zone (e.g. America/New_York).");
      if (!name.trim()) throw new ApiError(0, "VALIDATION", "Name can't be empty.");
      const body: ProfileUpdate = {
        displayName: name.trim(), unit, goalWeightKg: g != null ? toKg(g, unit) : null,
        heightCm: h, reminderTime: reminder.trim() || null, timezone: tz.trim(),
      };
      await api("/me", { method: "PATCH", body });
    },
    onSuccess: async () => { setError(null); setSaved(true); await qc.invalidateQueries(); },
    onError: (e) => { setSaved(false); setError(e instanceof ApiError ? e.message : "Couldn't save. Try again."); },
  });

  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [pwMsg, setPwMsg] = useState<string | null>(null);
  const [pwErr, setPwErr] = useState<string | null>(null);
  const changePw = useMutation({
    mutationFn: async () => {
      const s = await api<AuthResponse>("/auth/change-password", { body: { currentPassword: cur, newPassword: next } });
      await adoptSession(s);
    },
    onSuccess: () => { setPwErr(null); setPwMsg("Password changed. Other devices were signed out."); setCur(""); setNext(""); },
    onError: (e) => { setPwMsg(null); setPwErr(e instanceof ApiError ? e.message : "Couldn't change password."); },
  });

  const [exportMsg, setExportMsg] = useState<string | null>(null);
  const exportData = useMutation({
    mutationFn: () => api("/me/export", { method: "POST" }),
    onSuccess: () => setExportMsg(`We emailed your data to ${user?.email}.`),
    onError: (e) => setExportMsg(e instanceof ApiError ? e.message : "Couldn't start the export."),
  });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [delPw, setDelPw] = useState("");
  const [delErr, setDelErr] = useState<string | null>(null);
  const deleteAccount = useMutation({
    mutationFn: () => api("/me", { method: "DELETE", body: { password: delPw } }),
    onSuccess: () => logout(),
    onError: (e) => setDelErr(e instanceof ApiError ? e.message : "Couldn't delete the account."),
  });

  return (
    <Screen title="Profile" subtitle={user ? user.email : undefined}>
      {user && !user.emailVerified ? (
        <Text style={{ color: t.muted, marginBottom: 16 }}>Email not verified yet. You'll need it to create or join groups.</Text>
      ) : null}
      <Field label="Display name" value={name} onChangeText={setName} maxLength={50} />
      <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
        <View style={{ flex: 1 }}><Button title="kg" kind={unit === "kg" ? "primary" : "link"} onPress={() => setUnit("kg")} /></View>
        <View style={{ flex: 1 }}><Button title="lb" kind={unit === "lb" ? "primary" : "link"} onPress={() => setUnit("lb")} /></View>
      </View>
      <Field label={`Goal weight (${unit})`} keyboardType="decimal-pad" value={goal} onChangeText={setGoal} />
      {p?.goalWarning ? <Text style={{ color: t.error, marginBottom: 12 }}>{p.goalWarning}</Text> : null}
      <Field label="Height (cm)" keyboardType="decimal-pad" value={height} onChangeText={setHeight} />
      <Field label="Reminder time (HH:MM, blank = off)" value={reminder} onChangeText={setReminder} autoCapitalize="none" />
      <Field label="Time zone" value={tz} onChangeText={setTz} autoCapitalize="none" />
      <ErrorText>{error}</ErrorText>
      {saved ? <Text accessibilityLiveRegion="polite" style={{ color: t.text, marginBottom: 8 }}>Saved ✓</Text> : null}
      <Button title="Save changes" onPress={() => save.mutate()} busy={save.isPending} />

      <View style={{ marginTop: 16 }}>
  <Button kind="link" title="Saved recipes" onPress={() => router.push("/recipes")} />
  <Button kind="link" title="Notification settings" onPress={() => router.push("/notifications/settings" as never)} />
      </View>
      <Text accessibilityRole="header" style={{ color: t.text, fontWeight: "700", fontSize: 18, marginTop: 32, marginBottom: 12 }}>Change password</Text>
      <Field label="Current password" secureTextEntry value={cur} onChangeText={setCur} autoCapitalize="none" />
      <Field label="New password" secureTextEntry value={next} onChangeText={setNext} autoCapitalize="none" />
      <ErrorText>{pwErr}</ErrorText>
      {pwMsg ? <Text accessibilityLiveRegion="polite" style={{ color: t.text, marginBottom: 8 }}>{pwMsg}</Text> : null}
      <Button title="Change password" onPress={() => changePw.mutate()} busy={changePw.isPending} disabled={!cur || !next} />

      <Text accessibilityRole="header" style={{ color: t.text, fontWeight: "700", fontSize: 18, marginTop: 32, marginBottom: 12 }}>Your data</Text>
      <Button kind="link" title="Email me my data (CSV)" onPress={() => exportData.mutate()} busy={exportData.isPending} />
      {exportMsg ? <Text accessibilityLiveRegion="polite" style={{ color: t.text, marginBottom: 8 }}>{exportMsg}</Text> : null}
      <Button kind="link" title="Privacy Policy" onPress={() => router.push("/legal?doc=privacy" as never)} />
      <Button kind="link" title="Terms of Use" onPress={() => router.push("/legal?doc=terms" as never)} />
      {confirmDelete ? (
        <View style={{ marginTop: 12 }}>
          <Text style={{ color: t.error, marginBottom: 8 }}>This permanently deletes your account, entries and photos. Competitions you own pass to the longest-standing member.</Text>
          <Field label="Confirm with your password" secureTextEntry value={delPw} onChangeText={setDelPw} autoCapitalize="none" />
          <ErrorText>{delErr}</ErrorText>
          <Button title="Delete my account" onPress={() => deleteAccount.mutate()} busy={deleteAccount.isPending} disabled={!delPw} />
          <Button kind="link" title="Cancel" onPress={() => { setConfirmDelete(false); setDelPw(""); setDelErr(null); }} />
        </View>
      ) : (
        <Button kind="link" title="Delete account" onPress={() => setConfirmDelete(true)} />
      )}

      <View style={{ marginTop: 32 }}>
        <Button title="Log out" onPress={() => logout()} />
        <Button kind="link" title="Log out of all devices" onPress={() => logout(true)} />
      </View>
    </Screen>
  );
}
