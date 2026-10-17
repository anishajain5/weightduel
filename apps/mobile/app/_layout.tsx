import { ActivityIndicator, View } from "react-native";
import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "../lib/auth";
import { useProfile } from "../lib/queries";
import { usePushRegistration } from "../lib/push";
import { Sentry } from "../lib/sentry";

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 30_000 } } });

function Gate() {
  const { status, user, verifySkipped } = useAuth();
  const ready = status === "signedIn" && (!!user?.emailVerified || verifySkipped);
  const profile = useProfile(ready);
  usePushRegistration(ready && !!profile.data?.onboarded);
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
        <Stack.Screen name="group/new" options={{ headerShown: true, title: "New competition" }} />
        <Stack.Screen name="group/[id]/index" options={{ headerShown: true, title: "Competition" }} />
        <Stack.Screen name="group/[id]/manage" options={{ headerShown: true, title: "Manage" }} />
        <Stack.Screen name="recipes" options={{ headerShown: true, title: "Saved recipes" }} />
        <Stack.Screen name="notifications/index" options={{ headerShown: true, title: "Notifications" }} />
        <Stack.Screen name="notifications/settings" options={{ headerShown: true, title: "Settings" }} />
        <Stack.Screen name="join" options={{ headerShown: true, title: "Join" }} />
        <Stack.Screen name="patterns/[groupId]/[userId]" options={{ headerShown: true, title: "Patterns" }} />
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
      <Stack.Screen name="legal" options={{ headerShown: true, title: "Legal" }} />
    </Stack>
  );
}

function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <StatusBar style="auto" />
        <Gate />
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default Sentry.wrap(RootLayout);
