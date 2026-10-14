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

import type { FeedItem, GroupDetail, GroupSeries, GroupSummary, Leaderboard, SeriesMode } from "@wid/shared";

export const useGroups = () =>
  useQuery({ queryKey: ["groups"], queryFn: async () => (await api<{ groups: GroupSummary[] }>("/groups")).groups });

export const useGroup = (id: string) => useQuery({ queryKey: ["group", id], queryFn: () => api<GroupDetail>(`/groups/${id}`) });

export const useLeaderboard = (id: string) =>
  useQuery({ queryKey: ["group", id, "leaderboard"], queryFn: () => api<Leaderboard>(`/groups/${id}/leaderboard`) });

export const useSeries = (id: string, mode: SeriesMode | null) =>
  useQuery({
    queryKey: ["group", id, "series", mode],
    queryFn: () => api<GroupSeries>(`/groups/${id}/series?mode=${mode}`),
    enabled: mode !== null,
  });

export const useFeed = (id: string) =>
  useQuery({ queryKey: ["group", id, "feed"], queryFn: async () => (await api<{ items: FeedItem[] }>(`/groups/${id}/feed`)).items });

import type { PatternsResponse } from "@wid/shared";

/** `/patterns/me` or `/patterns/:groupId/:userId`. */
export const usePatterns = (path: string, days: number) =>
  useQuery({ queryKey: ["patterns", path, days], queryFn: () => api<PatternsResponse>(`${path}?days=${days}`) });
