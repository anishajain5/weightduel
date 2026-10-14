import { useCallback, useState } from "react";
import { ApiError } from "./api";

/** Wraps an async action with busy/error state; surfaces API messages. */
export function useSubmit() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : e instanceof Error && e.message ? "Couldn't reach the server. Check your connection." : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, error, setError, run };
}
