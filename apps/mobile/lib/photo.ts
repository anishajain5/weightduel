import { Platform } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { api, ApiError } from "./api";

export interface PickedPhoto {
  key: string;
  localUri: string;
}

const MAX_UPLOAD_BYTES = 400_000; // server hard cap is 450 KB
const MAX_SIDE = 1024; // BRD 4.6: max 1024 px, JPEG ~0.8

/** Picks a scale photo, compresses it on the device, and uploads it via a pre-signed URL. Returns null if cancelled. */
export async function pickAndUploadPhoto(source: "camera" | "library"): Promise<PickedPhoto | null> {
  if (Platform.OS !== "web") {
    const perm =
      source === "camera" ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) throw new ApiError(0, "PERMISSION", source === "camera" ? "Camera access is turned off for this app." : "Photo access is turned off for this app.");
  }
  const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], quality: 1 };
  const res = source === "camera" ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
  if (res.canceled || !res.assets[0]) return null;
  const asset = res.assets[0];

  const resize = asset.width >= asset.height ? { width: Math.min(asset.width, MAX_SIDE) } : { height: Math.min(asset.height, MAX_SIDE) };
  // Photos are stored server-side with a size cap, so step the quality down until it fits.
  let img = await manipulateAsync(asset.uri, [{ resize }], { compress: 0.8, format: SaveFormat.JPEG });
  let blob = await (await fetch(img.uri)).blob();
  for (const quality of [0.6, 0.4]) {
    if (blob.size <= MAX_UPLOAD_BYTES) break;
    img = await manipulateAsync(asset.uri, [{ resize }], { compress: quality, format: SaveFormat.JPEG });
    blob = await (await fetch(img.uri)).blob();
  }
  if (blob.size > MAX_UPLOAD_BYTES) throw new ApiError(0, "TOO_LARGE", "That photo is too large. Try a different one.");

  const { uploadUrl, key } = await api<{ uploadUrl: string; key: string }>("/uploads/photo-url", { body: { contentType: "image/jpeg" } });
  const put = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": "image/jpeg" }, body: blob });
  if (!put.ok) throw new ApiError(put.status, "UPLOAD_FAILED", "Couldn't upload the photo. Try again.");
  return { key, localUri: img.uri };
}
