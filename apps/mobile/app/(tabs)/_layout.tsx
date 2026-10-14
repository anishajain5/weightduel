import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

const tabs = [
  { name: "index", title: "Log", icon: "create-outline" },
  { name: "race", title: "Race", icon: "podium-outline" },
  { name: "why", title: "Why", icon: "analytics-outline" },
  { name: "cravings", title: "Cravings", icon: "restaurant-outline" },
  { name: "profile", title: "Profile", icon: "person-outline" },
] as const;

export default function TabsLayout() {
  return (
    <Tabs>
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
