import { useQuery } from "@tanstack/react-query";
import type { Profile, WeighIn } from "@wid/shared";
import { api } from "./api";

export const useProfile = (enabled = true) =>
  useQuery({ queryKey: ["profile"], queryFn: () => api<Profile>("/me"), enabled });

export const useWeighIn = (date: string) =>
  useQuery({
    queryKey: ["weighIn", date],
    queryFn: async () => (await api<{ entries: WeighIn[] }>(`/weigh-ins?from=${date}&to=${date}`)).entries[0] ?? null,
  });
