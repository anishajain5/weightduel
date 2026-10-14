import { useState } from "react";
import { Image, Platform, Share, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { fromKg, type FeedItem, type LeaderRow, type SeriesMode } from "@wid/shared";
import { Button, ErrorText, Screen, useTheme } from "../../../components/ui";
import { LineChart, PALETTE } from "../../../components/chart";
import { confirm } from "../../../components/confirm";
import { api, ApiError } from "../../../lib/api";
import { useFeed, useGroup, useLeaderboard, useProfile, useSeries } from "../../../lib/queries";

const MODE_LABEL: Record<SeriesMode, string> = { lost: "Lost", pct: "% lost", weight: "Weight" };
const tick = (v: boolean | null) => (v === null ? "–" : v ? "✓" : "✗");

export default function GroupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const t = useTheme();
  const { data: profile } = useProfile();
  const unit = profile?.unit ?? "kg";
  const group = useGroup(id);
  const board = useLeaderboard(id);
  const feed = useFeed(id);
  const g = group.data;

  const [picked, setPicked] = useState<SeriesMode | null>(null);
  const mode = picked && g?.allowedModes.includes(picked) ? picked : g?.allowedModes[0] ?? null;
  const series = useSeries(id, mode);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const leave = useMutation({
    mutationFn: () => api(`/groups/${id}/leave`, { method: "POST" }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["groups"] });
      router.replace("/race");
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : "Couldn't leave."),
  });

  const share = async () => {
    if (!g) return;
    const text = `Join my Weigh-In Duel competition "${g.name}": ${g.shareLink} (code ${g.joinCode})`;
    try {
      if (Platform.OS === "web" && !(globalThis.navigator && "share" in globalThis.navigator)) {
        await Clipboard.setStringAsync(text);
        setMsg("Invite copied.");
      } else {
        await Share.share({ message: text });
      }
    } catch {
      /* user dismissed the share sheet */
    }
  };
  const copy = async () => {
    if (!g) return;
    await Clipboard.setStringAsync(g.joinCode);
    setMsg("Code copied.");
  };

  if (group.isPending) return <Screen title="Loading…"><Text style={{ color: t.muted }}>One moment.</Text></Screen>;
  if (!g) {
    return (
      <Screen title="Not found">
        <Text style={{ color: t.muted, marginBottom: 12 }}>This competition doesn't exist, or you're no longer in it.</Text>
        <Button title="Back to Race" onPress={() => router.replace("/race")} />
      </Screen>
    );
  }

  const fmtScore = (r: LeaderRow) =>
    r.pctLost !== null ? `${r.pctLost > 0 ? "−" : r.pctLost < 0 ? "+" : ""}${Math.abs(r.pctLost)}%` :
    r.lostKg !== null ? `${r.lostKg > 0 ? "−" : r.lostKg < 0 ? "+" : ""}${Math.abs(fromKg(r.lostKg, unit))} ${unit}` : "–";

  const convert = (v: number) => (mode === "pct" ? v : fromKg(v, unit));
  const fmtY = (v: number) => (mode === "pct" ? `${Math.round(v * 10) / 10}%` : `${Math.round(v * 10) / 10}`);
  const lines = (series.data?.lines ?? []).map((l, i) => ({
    id: l.userId,
    label: l.isMe ? `${l.displayName} (you)` : l.displayName,
    color: PALETTE[i % PALETTE.length]!,
    bold: l.isMe,
    points: l.points.map((p) => ({ date: p.date, value: convert(p.value) })),
  }));

  return (
    <Screen title={g.name} subtitle={`${g.memberCount} members · ${g.scoring === "pct" ? "scored by % of starting weight" : "scored by weight lost"} · ${g.startDate}${g.endDate ? ` → ${g.endDate}` : ""}`}>
      {g.status === "ended" ? (
        <View accessibilityRole="alert" style={{ borderWidth: 1, borderColor: t.border, borderRadius: 12, padding: 14, marginBottom: 16 }}>
          <Text style={{ color: t.text, fontWeight: "700", fontSize: 16 }}>
            {g.winner ? `🏆 ${g.winner.displayName} won!` : "This competition has ended."}
          </Text>
          <Text style={{ color: t.muted, marginTop: 2 }}>Final standings are frozen. You can still look around.</Text>
        </View>
      ) : null}

      {board.data?.leadLine ? <Text style={{ color: t.text, fontSize: 16, fontWeight: "600", marginBottom: 12 }}>{board.data.leadLine}</Text> : null}

      <Text accessibilityRole="header" style={{ color: t.text, fontSize: 18, fontWeight: "700", marginBottom: 8 }}>Leaderboard</Text>
      {board.isPending ? <Text style={{ color: t.muted }}>Loading…</Text> : null}
      {board.data?.rows.map((r) => (
        <View key={r.userId} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: t.border }}
          accessible accessibilityLabel={`${r.rank ? `Rank ${r.rank}` : "Not ranked yet"}, ${r.displayName}${r.isMe ? " (you)" : ""}, ${fmtScore(r)}, ${r.daysLogged} days logged, ${r.streak} day streak`}>
          <Text style={{ width: 28, color: t.muted, fontWeight: "700" }}>{r.rank ?? "–"}</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.text, fontWeight: r.isMe ? "700" : "500" }}>{r.displayName}{r.isMe ? " (you)" : ""}</Text>
            <Text style={{ color: t.muted, fontSize: 12 }}>
              {r.daysLogged} days logged · {r.streak}d streak{r.weightKg !== null ? ` · ${fromKg(r.weightKg, unit)} ${unit}` : ""}
            </Text>
          </View>
          <Text style={{ color: t.text, fontWeight: "700", fontSize: 16 }}>{fmtScore(r)}</Text>
        </View>
      ))}

      <Text accessibilityRole="header" style={{ color: t.text, fontSize: 18, fontWeight: "700", marginTop: 24, marginBottom: 8 }}>Race</Text>
      {g.allowedModes.length > 1 ? (
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
          {g.allowedModes.map((m) => (
            <View key={m} style={{ flex: 1 }}><Button title={MODE_LABEL[m]} kind={mode === m ? "primary" : "link"} onPress={() => setPicked(m)} /></View>
          ))}
        </View>
      ) : null}
      {series.isPending ? <Text style={{ color: t.muted }}>Loading chart…</Text> : null}
      {series.data ? (
        lines.some((l) => l.points.length) ? (
          <LineChart lines={lines} from={series.data.from} to={series.data.to} format={fmtY} />
        ) : <Text style={{ color: t.muted }}>No weigh-ins yet. The chart appears once people start logging.</Text>
      ) : null}

      <Text accessibilityRole="header" style={{ color: t.text, fontSize: 18, fontWeight: "700", marginTop: 24, marginBottom: 8 }}>Recent weigh-ins</Text>
      {feed.data?.length === 0 ? <Text style={{ color: t.muted }}>Nothing logged yet.</Text> : null}
      {feed.data?.map((f: FeedItem, i) => (
        <View key={`${f.userId}${f.date}${i}`} style={{ flexDirection: "row", gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: t.border }}>
          {f.photoUrl ? <Image accessibilityLabel={`${f.displayName}'s scale photo`} source={{ uri: f.photoUrl }} style={{ width: 56, height: 56, borderRadius: 8 }} /> : null}
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.text, fontWeight: "600" }}>
              {f.displayName}{f.isMe ? " (you)" : ""} · {f.date}{f.weightKg !== null ? ` · ${fromKg(f.weightKg, unit)} ${unit}` : ""}
            </Text>
            <Text style={{ color: t.muted, fontSize: 13 }} accessibilityLabel={`Ate healthy ${f.ate ?? "not set"}, exercised ${f.moved ?? "not set"}, slept well ${f.slept ?? "not set"}, intentional ${f.intent ?? "not set"}`}>
              Ate {tick(f.ate)}  Move {tick(f.moved)}  Sleep {tick(f.slept)}  Intent {tick(f.intent)}{f.score !== null ? `  ·  ${f.score}/5` : ""}
            </Text>
          </View>
        </View>
      ))}

      <Text accessibilityRole="header" style={{ color: t.text, fontSize: 18, fontWeight: "700", marginTop: 24, marginBottom: 8 }}>Invite friends</Text>
      <Text style={{ color: t.text, fontSize: 24, fontWeight: "800", letterSpacing: 3, marginBottom: 8 }} selectable accessibilityLabel={`Join code ${g.joinCode.split("").join(" ")}`}>{g.joinCode}</Text>
      {g.status === "active" ? (
        <>
          <Button title="Share invite" onPress={share} />
          <Button kind="link" title="Copy code" onPress={copy} />
        </>
      ) : null}
      {msg ? <Text accessibilityLiveRegion="polite" style={{ color: t.text, marginBottom: 8 }}>{msg}</Text> : null}

      <ErrorText>{error}</ErrorText>
      <View style={{ marginTop: 24 }}>
        {g.role === "owner" ? <Button title="Manage competition" onPress={() => router.push({ pathname: "/group/[id]/manage", params: { id } })} /> : null}
        <Button kind="link" title="Leave competition" busy={leave.isPending} onPress={async () => {
          const extra = g.role === "owner" ? " Ownership passes to the longest-standing member." : "";
          if (await confirm("Leave this competition?", `Your weigh-ins stay yours, but you'll disappear from the leaderboard.${extra}`, "Leave")) leave.mutate();
        }} />
      </View>
    </Screen>
  );
}
