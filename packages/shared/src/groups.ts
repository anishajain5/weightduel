import { z } from "zod";
import { dateSchema } from "./weighins";

export const JOIN_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0 O 1 I L
export const JOIN_CODE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;
export const normalizeJoinCode = (s: string) => s.trim().toUpperCase().replace(/[\s-]/g, "");

export const scoringSchema = z.enum(["pct", "abs"]);
export const privacySchema = z.enum(["pct_only", "actual"]);

export const createGroupSchema = z
  .object({
    name: z.string().trim().min(1).max(40),
    startDate: dateSchema.optional(),
    endDate: dateSchema.nullable().optional(),
    scoring: scoringSchema.default("pct"),
    maxMembers: z.number().int().min(2).max(50).default(20),
    privacy: privacySchema.default("pct_only"),
    photosVisible: z.boolean().default(true),
  })
  .strict();
export type CreateGroupInput = z.input<typeof createGroupSchema>;

export const updateGroupSchema = z
  .object({
    name: z.string().trim().min(1).max(40),
    endDate: dateSchema.nullable(),
    privacy: privacySchema,
    photosVisible: z.boolean(),
    maxMembers: z.number().int().min(2).max(50),
  })
  .partial()
  .strict();
export type UpdateGroupInput = z.infer<typeof updateGroupSchema>;

export const joinGroupSchema = z.object({ code: z.string().transform(normalizeJoinCode).pipe(z.string().regex(JOIN_CODE_RE, "Invalid code")) }).strict();
export const transferSchema = z.object({ userId: z.string().uuid() }).strict();

export type SeriesMode = "lost" | "pct" | "weight";

/** Which chart modes a viewer may request for a group (privacy-aware). */
export function allowedModes(privacy: "pct_only" | "actual", scoring: "pct" | "abs"): SeriesMode[] {
  if (privacy === "actual") return ["lost", "pct", "weight"];
  return scoring === "pct" ? ["pct"] : ["lost"];
}

export interface GroupSummary {
  id: string;
  name: string;
  role: "owner" | "member";
  status: "active" | "ended";
  memberCount: number;
  startDate: string;
  endDate: string | null;
  scoring: "pct" | "abs";
}

export interface GroupDetail extends GroupSummary {
  ownerId: string;
  ownerName: string;
  maxMembers: number;
  privacy: "pct_only" | "actual";
  photosVisible: boolean;
  joinCode: string;
  shareLink: string;
  allowedModes: SeriesMode[];
  winner: { userId: string; displayName: string } | null;
  members: { userId: string; displayName: string; role: "owner" | "member"; joinedAt: string }[];
}

export interface GroupPreview {
  name: string;
  ownerName: string;
  memberCount: number;
  maxMembers: number;
  startDate: string;
  scoring: "pct" | "abs";
  status: "active" | "ended";
  alreadyMember: boolean;
}

export interface LeaderRow {
  userId: string;
  displayName: string;
  isMe: boolean;
  rank: number | null;
  /** Null when this viewer may not see it (privacy) or there is no baseline yet. */
  pctLost: number | null;
  lostKg: number | null;
  weightKg: number | null;
  daysLogged: number;
  streak: number;
}

export interface Leaderboard {
  status: "active" | "ended";
  asOf: string;
  rows: LeaderRow[];
  /** e.g. "Priya leads by 1.4% of starting weight." */
  leadLine: string | null;
}

export interface SeriesLine {
  userId: string;
  displayName: string;
  isMe: boolean;
  points: { date: string; value: number }[];
}
export interface GroupSeries {
  mode: SeriesMode;
  from: string;
  to: string;
  lines: SeriesLine[];
}

export interface FeedItem {
  userId: string;
  displayName: string;
  isMe: boolean;
  date: string;
  weightKg: number | null;
  ate: boolean | null;
  moved: boolean | null;
  slept: boolean | null;
  intent: boolean | null;
  score: number | null;
  photoUrl: string | null;
}
