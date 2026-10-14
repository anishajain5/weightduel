import { Text } from "react-native";
import { Button, Screen, useTheme } from "../../components/ui";
import { useAuth } from "../../lib/auth";

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const t = useTheme();
  return (
    <Screen title="Profile" subtitle={user ? `${user.displayName} · ${user.email}` : undefined}>
      {user && !user.emailVerified ? (
        <Text style={{ color: t.muted, marginBottom: 16 }}>Email not verified yet. You'll need it to create or join groups.</Text>
      ) : null}
      <Button title="Log out" onPress={() => logout()} />
      <Button kind="link" title="Log out of all devices" onPress={() => logout(true)} />
    </Screen>
  );
}
