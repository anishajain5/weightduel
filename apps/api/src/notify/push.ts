export interface PushMessage { to: string; title: string; body: string; data?: Record<string, unknown> }
export interface PushResult { token: string; ok: boolean; /** Expo says this token is dead and should be removed. */ invalid: boolean }

export interface PushSender {
  send(messages: PushMessage[]): Promise<PushResult[]>;
}

/** Expo Push API (wraps APNs and FCM). Batches of up to 100. */
export class ExpoPushSender implements PushSender {
  constructor(private accessToken?: string) {}
  async send(messages: PushMessage[]): Promise<PushResult[]> {
    const out: PushResult[] = [];
    for (let i = 0; i < messages.length; i += 100) {
      const batch = messages.slice(i, i + 100);
      try {
        const res = await fetch("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json", ...(this.accessToken ? { Authorization: `Bearer ${this.accessToken}` } : {}) },
          body: JSON.stringify(batch.map((m) => ({ ...m, sound: "default", priority: "high" }))),
        });
        const json = (await res.json()) as { data?: { status: string; details?: { error?: string } }[] };
        batch.forEach((m, k) => {
          const t = json.data?.[k];
          out.push({ token: m.to, ok: t?.status === "ok", invalid: t?.details?.error === "DeviceNotRegistered" });
        });
      } catch {
        batch.forEach((m) => out.push({ token: m.to, ok: false, invalid: false }));
      }
    }
    return out;
  }
}

export class FakePush implements PushSender {
  sent: PushMessage[] = [];
  invalid = new Set<string>();
  async send(messages: PushMessage[]) {
    this.sent.push(...messages);
    return messages.map((m) => ({ token: m.to, ok: !this.invalid.has(m.to), invalid: this.invalid.has(m.to) }));
  }
}
