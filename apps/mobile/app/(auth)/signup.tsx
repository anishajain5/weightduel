import { useState } from "react";
import { Link } from "expo-router";
import { Switch, Text, View } from "react-native";
import { displayNameSchema, emailSchema, passwordSchema } from "@wid/shared";
import { Button, ErrorText, Field, Screen, useTheme } from "../../components/ui";
import { useAuth } from "../../lib/auth";
import { useSubmit } from "../../lib/useSubmit";

export default function Signup() {
  const { signup } = useAuth();
  const t = useTheme();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [accepted, setAccepted] = useState(false);
  const { busy, error, setError, run } = useSubmit();

  const submit = () =>
    run(async () => {
      const n = displayNameSchema.safeParse(name);
      if (!n.success) return setError(n.error.issues[0]!.message);
      const e = emailSchema.safeParse(email);
      if (!e.success) return setError(e.error.issues[0]!.message);
      const p = passwordSchema.safeParse(password);
      if (!p.success) return setError(p.error.issues[0]!.message);
      if (password !== confirm) return setError("Passwords don't match");
      if (!accepted) return setError("Accept the Terms and Privacy Policy to continue");
      await signup({ displayName: n.data, email: e.data, password, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone });
    });

  return (
    <Screen title="Create account" subtitle="We'll email you a 6-digit code to verify it.">
      <Field label="Display name" value={name} onChangeText={setName} autoComplete="name" textContentType="name" />
      <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" />
      <Field label="Password (8+ characters)" value={password} onChangeText={setPassword} secureTextEntry textContentType="newPassword" />
      <Field label="Confirm password" value={confirm} onChangeText={setConfirm} secureTextEntry textContentType="newPassword" />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <Switch accessibilityLabel="Accept Terms and Privacy Policy" value={accepted} onValueChange={setAccepted} />
        <Text style={{ color: t.text, flex: 1 }}>I accept the Terms and Privacy Policy</Text>
      </View>
      <ErrorText>{error}</ErrorText>
      <Button title="Create account" onPress={submit} busy={busy} />
      <View style={{ alignItems: "center", marginTop: 18 }}>
        <Link href="/login" style={{ color: t.text, textDecorationLine: "underline" }}>I already have an account</Link>
      </View>
    </Screen>
  );
}
