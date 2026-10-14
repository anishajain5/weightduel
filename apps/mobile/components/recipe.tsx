import { Text, View } from "react-native";
import type { Recipe } from "@wid/shared";
import { useTheme } from "./ui";

const kcal = (n: number) => Math.round(n);

export function RecipeCard({ recipe }: { recipe: Recipe }) {
  const t = useTheme();
  const m = recipe.per_serving;
  const saved = Math.max(0, kcal(recipe.usual_version_calories - m.calories));
  const H = ({ children }: { children: string }) => (
    <Text accessibilityRole="header" style={{ color: t.text, fontWeight: "700", marginTop: 14, marginBottom: 6 }}>{children}</Text>
  );
  return (
    <View style={{ borderWidth: 1, borderColor: t.border, borderRadius: 14, padding: 16, marginBottom: 12 }}>
      <Text accessibilityRole="header" style={{ color: t.text, fontSize: 20, fontWeight: "700" }}>{recipe.name}</Text>
      <Text style={{ color: t.muted, marginTop: 4 }}>{recipe.pitch}</Text>
      <Text style={{ color: t.muted, fontSize: 13, marginTop: 6 }}>{recipe.servings} {recipe.servings === 1 ? "serving" : "servings"} · {recipe.minutes} min</Text>

      <View accessible accessibilityLabel={`Per serving: ${kcal(m.calories)} calories, ${kcal(m.protein_g)} grams protein, ${kcal(m.carbs_g)} grams carbs, ${kcal(m.fat_g)} grams fat, ${kcal(m.fiber_g)} grams fiber`}
        style={{ flexDirection: "row", marginTop: 12 }}>
        {([["kcal", m.calories], ["protein", m.protein_g], ["carbs", m.carbs_g], ["fat", m.fat_g], ["fiber", m.fiber_g]] as const).map(([k, v]) => (
          <View key={k} style={{ flex: 1, alignItems: "center" }}>
            <Text style={{ color: t.text, fontSize: 18, fontWeight: "700" }}>{kcal(v)}{k === "kcal" ? "" : "g"}</Text>
            <Text style={{ color: t.muted, fontSize: 11 }}>{k}</Text>
          </View>
        ))}
      </View>
      {saved > 0 ? <Text style={{ color: "#16a34a", fontWeight: "600", marginTop: 10 }}>About {saved} kcal lighter than the usual version ({kcal(recipe.usual_version_calories)})</Text> : null}

      <H>Ingredients</H>
      {recipe.ingredients.map((x, i) => <Text key={i} style={{ color: t.text, marginBottom: 2 }}>• {x}</Text>)}
      <H>Steps</H>
      {recipe.steps.map((x, i) => <Text key={i} style={{ color: t.text, marginBottom: 4 }}>{i + 1}. {x}</Text>)}
      {recipe.tip ? <><H>Tip</H><Text style={{ color: t.text }}>{recipe.tip}</Text></> : null}
      <Text style={{ color: t.muted, fontSize: 12, marginTop: 12 }}>Macros are estimates.</Text>
    </View>
  );
}
