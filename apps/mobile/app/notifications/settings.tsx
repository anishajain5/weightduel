import { Switch, Text, View } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { NOTIFICATION_TYPES, type NotificationPrefRow } from "@wid/shared";
import { ErrorText, Screen, useTheme } from "../../components/ui";
import { api } from "../../lib/api";
import { useNotificationPrefs } from "../../lib/queries";

export default function NotificationSettings() {
  const t = useTheme();
  const qc = useQueryClient();
  const { data: prefs } = useNotificationPrefs();
  const save = useMutation({
    mutationFn: (row: NotificationPrefRow) => api("/notification-prefs", { method: "PUT", body: { prefs: [row] } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notificationPrefs"] }),
  });
  const by = new Map((prefs ?? []).map((p) => [p.type, p]));
  return (
    <Screen title="Notification settings" subtitle="Quiet hours (10 pm–7 am) silence push but never the inbox.">
      <ErrorText>{save.isError ? "Couldn't save that change." : null}</ErrorText>
      {NOTIFICATION_TYPES.map((n) => {
        const p = by.get(n.key) ?? { type: n.key, push: n.defaultPush, email: n.defaultEmail };
        return (
          <View key={n.key} style={{ paddingVertical: 10, borderBottomWidth: 1, borderColor: t.border }}>
            <Text style={{ color: t.text, fontWeight: "600" }}>{n.label}</Text>
            <Text style={{ color: t.muted, marginBottom: 6 }}>{n.description}</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={{ color: t.text }}>Push</Text>
              <Switch accessibilityLabel={`${n.label} push`} value={p.push} onValueChange={(v) => save.mutate({ ...p, push: v })} />
              {n.canEmail ? (
                <>
                  <Text style={{ color: t.text, marginLeft: 16 }}>Email</Text>
                  <Switch accessibilityLabel={`${n.label} email`} value={p.email} onValueChange={(v) => save.mutate({ ...p, email: v })} />
                </>
              ) : null}
            </View>
          </View>
        );
      })}
    </Screen>
  );
}
