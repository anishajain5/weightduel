import { ActivityIndicator, View } from "react-native";
import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "../lib/auth";
import { useProfile } from "../lib/queries";

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 30_000 } } });

function Gate() {
  const { status, user, verifySkipped } = useAuth();
  const ready = status === "signedIn" && (!!user?.emailVerified || verifySkipped);
  const profile = useProfile(ready);
  // Never leak one account's cached data into the next session.
  useEffect(() => {
    if (status === "signedOut") queryClient.clear();
  }, [status]);
  if (status === "loading" || (ready && profile.isPending)) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator accessibilityLabel="Loading" />
      </View>
    );
  }
  const signedIn = status === "signedIn";
  const verified = !!user?.emailVerified || verifySkipped;
  const onboarded = profile.data?.onboarded ?? false;
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={signedIn && verified && onboarded}>
        <Stack.Screen name="(tabs)" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && verified && !onboarded}>
        <Stack.Screen name="onboarding" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && !verified}>
        <Stack.Screen name="verify" />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="(auth)/login" />
        <Stack.Screen name="(auth)/signup" />
        <Stack.Screen name="(auth)/forgot" />
      </Stack.Protected>
      {/* Reachable from a reset deep link whether or not a session exists. */}
      <Stack.Screen name="reset" />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <StatusBar style="auto" />
        <Gate />
      </AuthProvider>
    </QueryClientProvider>
  );
}
