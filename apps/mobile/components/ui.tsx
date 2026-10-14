import { forwardRef, type ReactNode } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
  type TextInputProps,
} from "react-native";

export function useTheme() {
  const dark = useColorScheme() === "dark";
  return {
    bg: dark ? "#0e0f12" : "#ffffff",
    text: dark ? "#f4f4f5" : "#111114",
    muted: dark ? "#a1a1aa" : "#52525b",
    border: dark ? "#3f3f46" : "#d4d4d8",
    primary: dark ? "#f4f4f5" : "#111114",
    onPrimary: dark ? "#111114" : "#ffffff",
    error: dark ? "#fca5a5" : "#b91c1c",
  };
}

export function Screen({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  const t = useTheme();
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.bg }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={s.screen} keyboardShouldPersistTaps="handled">
        <Text accessibilityRole="header" style={[s.title, { color: t.text }]}>{title}</Text>
        {subtitle ? <Text style={[s.subtitle, { color: t.muted }]}>{subtitle}</Text> : null}
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export const Field = forwardRef<TextInput, TextInputProps & { label: string }>(function Field({ label, style, ...p }, ref) {
  const t = useTheme();
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={[s.label, { color: t.text }]}>{label}</Text>
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        placeholderTextColor={t.muted}
        style={[s.input, { color: t.text, borderColor: t.border }, style]}
        {...p}
      />
    </View>
  );
});

export function Button({ title, onPress, busy, kind = "primary", disabled }: {
  title: string; onPress: () => void; busy?: boolean; kind?: "primary" | "link"; disabled?: boolean;
}) {
  const t = useTheme();
  const link = kind === "link";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: !!(disabled || busy), busy: !!busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={[s.btn, link ? s.btnLink : { backgroundColor: t.primary }, (disabled || busy) && { opacity: 0.5 }]}
    >
      {busy ? <ActivityIndicator color={link ? t.text : t.onPrimary} /> : (
        <Text style={{ color: link ? t.text : t.onPrimary, fontWeight: "600", fontSize: 16, textDecorationLine: link ? "underline" : "none" }}>{title}</Text>
      )}
    </Pressable>
  );
}

export function ErrorText({ children }: { children?: string | null }) {
  const t = useTheme();
  if (!children) return null;
  return <Text accessibilityRole="alert" style={{ color: t.error, marginBottom: 12 }}>{children}</Text>;
}

const s = StyleSheet.create({
  screen: { padding: 24, paddingTop: 72, flexGrow: 1 },
  title: { fontSize: 28, fontWeight: "700", marginBottom: 6 },
  subtitle: { fontSize: 16, marginBottom: 24, lineHeight: 22 },
  label: { fontSize: 14, fontWeight: "600", marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, minHeight: 48 },
  btn: { minHeight: 48, borderRadius: 10, alignItems: "center", justifyContent: "center", paddingHorizontal: 16, marginTop: 6 },
  btnLink: { backgroundColor: "transparent" },
});
