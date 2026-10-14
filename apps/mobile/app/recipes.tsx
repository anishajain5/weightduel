import { useState } from "react";
import { Text, View } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button, ErrorText, Screen, useTheme } from "../components/ui";
import { RecipeCard } from "../components/recipe";
import { api } from "../lib/api";
import { useSavedRecipes } from "../lib/queries";

export default function SavedRecipes() {
  const t = useTheme();
  const qc = useQueryClient();
  const { data, isPending, error } = useSavedRecipes();
  const [failed, setFailed] = useState(false);
  const del = useMutation({
    mutationFn: (id: string) => api(`/recipes/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["recipes"] }),
    onError: () => setFailed(true),
  });
  return (
    <Screen title="Saved recipes">
      {isPending ? <Text style={{ color: t.muted }}>Loading…</Text> : null}
      {error ? <ErrorText>Couldn't load your recipes.</ErrorText> : null}
      {failed ? <ErrorText>Couldn't delete that recipe.</ErrorText> : null}
      {data?.length === 0 ? <Text style={{ color: t.muted }}>Nothing saved yet. Find a lighter version of something you crave and tap Save.</Text> : null}
      {data?.map((r) => (
        <View key={r.id}>
          <Text style={{ color: t.muted, fontSize: 12, marginBottom: 4 }}>Craving: {r.craving}</Text>
          <RecipeCard recipe={r.recipe} />
          <Button kind="link" title="Delete" onPress={() => { setFailed(false); del.mutate(r.id); }} />
        </View>
      ))}
    </Screen>
  );
}
