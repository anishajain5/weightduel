import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { CRAVING_CHIPS, RECIPE_PREFS, type Recipe } from "@wid/shared";
import { Button, ErrorText, Field, Screen, useTheme } from "../../components/ui";
import { Toggle } from "../../components/form";
import { RecipeCard } from "../../components/recipe";
import { api, ApiError } from "../../lib/api";
import { useProfile } from "../../lib/queries";

export default function CravingsScreen() {
  const t = useTheme();
  const qc = useQueryClient();
  const router = useRouter();
  const { data: profile } = useProfile();
  const prefs = profile?.recipePrefs ?? {};
  const [craving, setCraving] = useState("");
  const [result, setResult] = useState<{ craving: string; recipe: Recipe } | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const msg = (e: unknown) => (e instanceof ApiError ? e.message : "Couldn't reach the server. Try again.");

  const setPref = useMutation({
    mutationFn: (next: Record<string, boolean>) => api("/me", { method: "PATCH", body: { recipePrefs: next } }),
    onSettled: () => qc.invalidateQueries({ queryKey: ["profile"] }),
    onError: (e) => setError(msg(e)),
  });

  const generate = useMutation({
    mutationFn: async (vars: { craving: string; exclude?: string }) =>
      (await api<{ recipe: Recipe }>("/ai/recipe", { body: { craving: vars.craving, exclude: vars.exclude } })).recipe,
    onSuccess: (recipe, vars) => { setResult({ craving: vars.craving, recipe }); setSavedId(null); setError(null); },
    onError: (e) => setError(msg(e)),
  });

  const save = useMutation({
    mutationFn: () => api<{ id: string }>("/recipes", { body: { craving: result!.craving, recipe: result!.recipe } }),
    onSuccess: async (r) => { setSavedId(r.id); await qc.invalidateQueries({ queryKey: ["recipes"] }); },
    onError: (e) => setError(msg(e)),
  });

  const go = (c: string) => { const v = c.trim(); if (v.length >= 2) { setError(null); generate.mutate({ craving: v }); } };

  return (
    <Screen title="Cravings" subtitle="Tell me what you're craving. I'll find a lighter version that scratches the same itch.">
      <Field label="I'm craving…" value={craving} onChangeText={setCraving} maxLength={60} returnKeyType="go" onSubmitEditing={() => go(craving)} />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        {CRAVING_CHIPS.map((c) => (
          <Pressable key={c} accessibilityRole="button" accessibilityLabel={`Craving ${c}`} onPress={() => { setCraving(c); go(c); }}
            style={{ borderWidth: 1, borderColor: t.border, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 14 }}>
            <Text style={{ color: t.text }}>{c}</Text>
          </Pressable>
        ))}
      </View>
      <Button title="Find a lighter version" onPress={() => go(craving)} busy={generate.isPending && !result} disabled={craving.trim().length < 2} />
      <ErrorText>{error}</ErrorText>

      {generate.isPending ? <Text accessibilityLiveRegion="polite" style={{ color: t.muted, marginVertical: 12 }}>Cooking something up… this takes a few seconds.</Text> : null}

      {result ? (
        <View style={{ marginTop: 16 }}>
          <RecipeCard recipe={result.recipe} />
          <Button title="Give me a different one" onPress={() => generate.mutate({ craving: result.craving, exclude: result.recipe.name })} busy={generate.isPending} />
          {savedId ? <Text style={{ color: t.muted, textAlign: "center", marginTop: 8 }}>Saved ✓</Text>
            : <Button kind="link" title="Save recipe" onPress={() => save.mutate()} busy={save.isPending} />}
        </View>
      ) : null}

      <Text accessibilityRole="header" style={{ color: t.text, fontSize: 18, fontWeight: "700", marginTop: 28, marginBottom: 12 }}>My preferences</Text>
      {RECIPE_PREFS.map((p) => (
        <Toggle key={p.key} label={p.label} value={!!prefs[p.key]} onChange={(v) => setPref.mutate({ ...prefs, [p.key]: v })} />
      ))}
      <Button kind="link" title="Saved recipes" onPress={() => router.push("/recipes")} />
    </Screen>
  );
}
