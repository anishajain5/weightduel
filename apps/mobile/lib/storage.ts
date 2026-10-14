import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

/**
 * Native: Keychain / Keystore via SecureStore.
 * Web: localStorage. This is readable by any script on the page, so the web app must
 * stay free of third-party scripts; the refresh token is rotated on every use and
 * revocable server-side, which limits the damage of a leak.
 */
const web = Platform.OS === "web";

export async function getSecret(key: string): Promise<string | null> {
  if (!web) return SecureStore.getItemAsync(key);
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export async function setSecret(key: string, value: string): Promise<void> {
  if (!web) return SecureStore.setItemAsync(key, value);
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch {
    // Private mode / storage blocked: session lasts until reload.
  }
}

export async function deleteSecret(key: string): Promise<void> {
  if (!web) return SecureStore.deleteItemAsync(key);
  try {
    globalThis.localStorage?.removeItem(key);
  } catch {
    // ignore
  }
}
