import { useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { Text } from "react-native";
import { passwordSchema } from "@wid/shared";
import { Button, ErrorText, Field, Screen, useTheme } from "../components/ui";
import { api, clearSession } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useSubmit } from "../lib/useSubmit";

export default function Reset() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const { logout } = useAuth();
  const t = useTheme();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [done, setDone] = useState(false);
  const { busy, error, setError, run } = useSubmit();

  const submit = () =>
    run(async () => {
      const p = passwordSchema.safeParse(password);
      if (!p.success) return setError(p.error.issues[0]!.message);
      if (password !== confirm) return setError("Passwords don't match");
      await api("/auth/reset-password", { auth: false, body: { token, newPassword: password } });
      // The server revoked every session, so drop the local one too.
      await clearSession();
      await logout();
      setDone(true);
    });

  if (!token) {
    return (
      <Screen title="Reset link problem" subtitle="This link is missing its token. Request a new reset email from the sign-in screen.">
        <Button title="Back to sign in" onPress={() => router.replace("/login")} />
      </Screen>
    );
  }

  return (
    <Screen title="Choose a new password" subtitle="You'll be signed out of all devices.">
      {done ? (
        <>
          <Text style={{ color: t.text, fontSize: 16, marginBottom: 16 }}>Password updated. Sign in with your new password.</Text>
          <Button title="Go to sign in" onPress={() => router.replace("/login")} />
        </>
      ) : (
        <>
          <Field label="New password" value={password} onChangeText={setPassword} secureTextEntry textContentType="newPassword" />
          <Field label="Confirm new password" value={confirm} onChangeText={setConfirm} secureTextEntry textContentType="newPassword" />
          <ErrorText>{error}</ErrorText>
          <Button title="Update password" onPress={submit} busy={busy} />
        </>
      )}
    </Screen>
  );
}
