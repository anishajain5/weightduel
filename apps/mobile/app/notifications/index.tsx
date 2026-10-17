import { useEffect } from "react";
import { Pressable, Text, View } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Button, Screen, useTheme } from "../../components/ui";
import { api } from "../../lib/api";
import { useNotifications } from "../../lib/queries";

export default function Inbox() {
  const t = useTheme();
  const router = useRouter();
  const qc = useQueryClient();
  const { data, isPending, isError, refetch } = useNotifications();

  // Opening the inbox marks everything read; unread dots stay for this view.
  const unread = data?.unread ?? 0;
  useEffect(() => {
    if (unread > 0) {
      const id = setTimeout(() => {
        api("/notifications/read", { method: "POST", body: {} }).then(() => qc.invalidateQueries({ queryKey: ["notifications"] })).catch(() => {});
      }, 1500);
      return () => clearTimeout(id);
    }
  }, [unread, qc]);

  return (
    <Screen title="Notifications">
      {isPending ? <Text style={{ color: t.muted }}>Loading…</Text> : null}
      {isError ? <Button title="Couldn't load. Retry" kind="link" onPress={() => refetch()} /> : null}
      {data && data.items.length === 0 ? <Text style={{ color: t.muted }}>Nothing yet. Joins, overtakes and competition updates show up here.</Text> : null}
      {data?.items.map((n) => (
        <Pressable
          key={n.id}
          accessibilityRole="button"
          onPress={() => n.data?.url && router.push(n.data.url as never)}
          style={{ paddingVertical: 12, borderBottomWidth: 1, borderColor: t.border, flexDirection: "row", gap: 10 }}
        >
          <View style={{ width: 8, height: 8, borderRadius: 4, marginTop: 7, backgroundColor: n.read ? "transparent" : t.primary }} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.text, fontWeight: "600" }}>{n.title}</Text>
            <Text style={{ color: t.text }}>{n.body}</Text>
            <Text style={{ color: t.muted, fontSize: 12, marginTop: 2 }}>{new Date(n.createdAt).toLocaleString()}</Text>
          </View>
        </Pressable>
      ))}
      <Button title="Notification settings" kind="link" onPress={() => router.push("/notifications/settings" as never)} />
    </Screen>
  );
}
