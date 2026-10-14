import { useEffect, useState } from "react";
import { Text } from "react-native";
import { codeSchema } from "@wid/shared";
import { Button, ErrorText, Field, Screen, useTheme } from "../components/ui";
import { useAuth } from "../lib/auth";
import { useSubmit } from "../lib/useSubmit";

export default function Verify() {
  const { user, verify, resendCode, skipVerify, logout } = useAuth();
  const t = useTheme();
  const [code, setCode] = useState("");
  const [cooldown, setCooldown] = useState(60);
  const [note, setNote] = useState<string | null>(null);
  const main = useSubmit();
  const resend = useSubmit();

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  const submit = () =>
    main.run(async () => {
      if (!codeSchema.safeParse(code).success) return main.setError("Enter the 6-digit code");
      await verify(code);
    });

  const again = () =>
    resend.run(async () => {
      await resendCode();
      setNote("New code sent.");
      setCooldown(60);
    });

  return (
    <Screen title="Verify your email" subtitle={`We sent a 6-digit code to ${user?.email}. It expires in 15 minutes.`}>
      <Field label="Verification code" value={code} onChangeText={(v) => setCode(v.replace(/\D/g, "").slice(0, 6))} keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" maxLength={6} onSubmitEditing={submit} />
      <ErrorText>{main.error ?? resend.error}</ErrorText>
      {note ? <Text style={{ color: t.muted, marginBottom: 12 }}>{note}</Text> : null}
      <Button title="Verify" onPress={submit} busy={main.busy} disabled={code.length !== 6} />
      <Button kind="link" title={cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"} onPress={again} busy={resend.busy} disabled={cooldown > 0} />
      <Button kind="link" title="Do this later" onPress={skipVerify} />
      <Button kind="link" title="Sign out" onPress={() => logout()} />
    </Screen>
  );
}
