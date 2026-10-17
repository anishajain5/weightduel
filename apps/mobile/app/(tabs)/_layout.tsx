import { Tabs } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useNotifications } from "../../lib/queries";

const tabs = [
  { name: "index", title: "Log", icon: "create-outline" },
  { name: "race", title: "Race", icon: "podium-outline" },
  { name: "why", title: "Why", icon: "analytics-outline" },
  { name: "cravings", title: "Cravings", icon: "restaurant-outline" },
  { name: "profile", title: "Profile", icon: "person-outline" },
] as const;

function Bell() {
  const router = useRouter();
  const { data } = useNotifications();
  const n = data?.unread ?? 0;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={n ? `Notifications, ${n} unread` : "Notifications"} onPress={() => router.push("/notifications" as never)} style={{ marginRight: 16 }}>
      <Ionicons name="notifications-outline" size={24} />
      {n > 0 ? (
        <View style={{ position: "absolute", top: -4, right: -6, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: "#dc2626", alignItems: "center", justifyContent: "center", paddingHorizontal: 3 }}>
          <Text style={{ color: "#fff", fontSize: 10, fontWeight: "700" }}>{n > 9 ? "9+" : n}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerRight: () => <Bell /> }}>
      {tabs.map((t) => (
        <Tabs.Screen
          key={t.name}
          name={t.name}
          options={{
            title: t.title,
            tabBarIcon: ({ color, size }) => <Ionicons name={t.icon} color={color} size={size} />,
          }}
        />
      ))}
    </Tabs>
  );
}
