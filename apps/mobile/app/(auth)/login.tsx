import { useState } from "react";
import { Link } from "expo-router";
import { Text, View } from "react-native";
import { emailSchema } from "@wid/shared";
import { Button, ErrorText, Field, Screen, useTheme } from "../../components/ui";
import { useAuth } from "../../lib/auth";
import { useSubmit } from "../../lib/useSubmit";

export default function Login() {
  const { login } = useAuth();
  const t = useTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { busy, error, setError, run } = useSubmit();

  const submit = () =>
    run(async () => {
      const e = emailSchema.safeParse(email);
      if (!e.success) return setError("Enter a valid email address");
      await login(e.data, password);
    });

  return (
    <Screen title="Weigh-In Duel" subtitle="Lose weight with friends. Sign in to your account.">
      <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" />
      <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" textContentType="password" onSubmitEditing={submit} />
      <ErrorText>{error}</ErrorText>
      <Button title="Sign in" onPress={submit} busy={busy} disabled={!email || !password} />
      <View style={{ alignItems: "center", marginTop: 18, gap: 14 }}>
        <Link href="/forgot" style={{ color: t.text, textDecorationLine: "underline" }}>Forgot password?</Link>
        <Text style={{ color: t.muted }}>New here?</Text>
        <Link href="/signup" style={{ color: t.text, fontWeight: "600" }}>Create account</Link>
      </View>
    </Screen>
  );
}
