import { useState } from "react";
import { Link } from "expo-router";
import { Text, View } from "react-native";
import { emailSchema } from "@wid/shared";
import { Button, ErrorText, Field, Screen, useTheme } from "../../components/ui";
import { api } from "../../lib/api";
import { useSubmit } from "../../lib/useSubmit";

export default function Forgot() {
  const t = useTheme();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const { busy, error, setError, run } = useSubmit();

  const submit = () =>
    run(async () => {
      const e = emailSchema.safeParse(email);
      if (!e.success) return setError("Enter a valid email address");
      await api("/auth/forgot-password", { auth: false, body: { email: e.data } });
      setSent(true);
    });

  return (
    <Screen title="Forgot password?" subtitle="Enter your email and we'll send a reset link.">
      {sent ? (
        <Text style={{ color: t.text, fontSize: 16, lineHeight: 22 }}>
          If an account exists, we've sent a reset link. It expires in 30 minutes. Open it on this phone.
        </Text>
      ) : (
        <>
          <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" onSubmitEditing={submit} />
          <ErrorText>{error}</ErrorText>
          <Button title="Send reset link" onPress={submit} busy={busy} disabled={!email} />
        </>
      )}
      <View style={{ alignItems: "center", marginTop: 18 }}>
        <Link href="/login" style={{ color: t.text, textDecorationLine: "underline" }}>Back to sign in</Link>
      </View>
    </Screen>
  );
}
