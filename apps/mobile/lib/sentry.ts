import * as Sentry from "@sentry/react-native";

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
/** No-op unless EXPO_PUBLIC_SENTRY_DSN is set. */
if (dsn) Sentry.init({ dsn, tracesSampleRate: 0.1, sendDefaultPii: false });
export { Sentry };
