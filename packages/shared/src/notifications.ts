import { z } from "zod";

export interface NotificationType {
  key: string;
  label: string;
  description: string;
  defaultPush: boolean;
  defaultEmail: boolean;
  /** Shown in the in-app inbox (otherwise push/email only). */
  inbox: boolean;
  /** Has an email channel at all. */
  canEmail: boolean;
}

export const NOTIFICATION_TYPES: NotificationType[] = [
  { key: "daily_reminder", label: "Daily reminder", description: "At your reminder time, if you haven't logged yet", defaultPush: true, defaultEmail: false, inbox: false, canEmail: false },
  { key: "streak_risk", label: "Streak at risk", description: "8 pm, if you have a streak of 3+ days and haven't logged", defaultPush: true, defaultEmail: false, inbox: false, canEmail: false },
  { key: "member_joined", label: "Member joined", description: "Someone joins your competition", defaultPush: true, defaultEmail: false, inbox: true, canEmail: false },
  { key: "overtaken", label: "Overtaken", description: "You drop a place on the leaderboard", defaultPush: true, defaultEmail: false, inbox: true, canEmail: false },
  { key: "digest", label: "Group activity digest", description: "9 pm: how many of your group logged today", defaultPush: false, defaultEmail: false, inbox: false, canEmail: false },
  { key: "weekly_recap", label: "Weekly recap", description: "Sunday 6 pm: your week and where you stand", defaultPush: true, defaultEmail: true, inbox: false, canEmail: true },
  { key: "competition", label: "Competition updates", description: "Start, ending soon (3 days), and ended with the winner", defaultPush: true, defaultEmail: true, inbox: true, canEmail: true },
];
export const NOTIFICATION_TYPE_KEYS = NOTIFICATION_TYPES.map((t) => t.key);
export const notificationType = (key: string) => NOTIFICATION_TYPES.find((t) => t.key === key);

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  data: { url?: string } | null;
  read: boolean;
  createdAt: string;
}
export interface NotificationList { items: NotificationItem[]; unread: number }

export interface NotificationPrefRow { type: string; push: boolean; email: boolean }

export const prefsUpdateSchema = z.object({
  prefs: z.array(z.object({ type: z.string().refine((t) => NOTIFICATION_TYPE_KEYS.includes(t)), push: z.boolean(), email: z.boolean() })).max(20),
});
export const pushTokenSchema = z.object({
  token: z.string().min(10).max(200).regex(/^(Expo|Exponent)PushToken\[[^\]]+\]$/),
  platform: z.enum(["ios", "android", "web"]),
});
export const markReadSchema = z.object({ ids: z.array(z.string().uuid()).max(100).optional() });
