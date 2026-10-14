import { Text, View } from "react-native";

export default function CravingsScreen() {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <Text accessibilityRole="header" style={{ fontSize: 22 }}>Cravings</Text>
    </View>
  );
}
