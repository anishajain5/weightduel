import { useEffect } from "react";
import { Platform } from "react-native";
import { useRouter } from "expo-router";
import Constants from "expo-constants";
import { api } from "./api";

/**
 * Native only. Needs an EAS project id (`eas init`); without one this silently does nothing,
 * so the app still runs in Expo Go / web / before the Expo account exists.
 */
export function usePushRegistration(enabled: boolean) {
  const router = useRouter();

  useEffect(() => {
    if (!enabled || Platform.OS === "web") return;
    let cancelled = false;
    (async () => {
      try {
        const Notifications = await import("expo-notifications");
        const Device = await import("expo-device");
        const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ?? Constants.easConfig?.projectId;
        if (!projectId || !Device.isDevice) return;
        Notifications.setNotificationHandler({
          handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
        });
        if (Platform.OS === "android") {
          await Notifications.setNotificationChannelAsync("default", { name: "Default", importance: Notifications.AndroidImportance.DEFAULT });
        }
        let { status } = await Notifications.getPermissionsAsync();
        if (status !== "granted") status = (await Notifications.requestPermissionsAsync()).status;
        if (status !== "granted" || cancelled) return;
        const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
        await api("/push-tokens", { method: "POST", body: { token, platform: Platform.OS === "ios" ? "ios" : "android" } });
      } catch {
        // Push is best effort; never block the app on it.
      }
    })();
    return () => { cancelled = true; };
  }, [enabled]);

  // Tapping a notification opens the screen its payload names.
  useEffect(() => {
    if (!enabled || Platform.OS === "web") return;
    let remove: (() => void) | undefined;
    (async () => {
      try {
        const Notifications = await import("expo-notifications");
        const sub = Notifications.addNotificationResponseReceivedListener((r) => {
          const url = (r.notification.request.content.data as { url?: string } | undefined)?.url;
          if (url && url.startsWith("/")) router.push(url as never);
        });
        remove = () => sub.remove();
      } catch { /* ignore */ }
    })();
    return () => remove?.();
  }, [enabled, router]);
}
