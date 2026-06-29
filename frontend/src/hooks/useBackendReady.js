import { useEffect, useState } from "react";

const API_URL = import.meta.env.VITE_API_URL;

export function useBackendReady() {
  const [ready, setReady] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (!API_URL) {
      setReady(true);
      setChecking(false);
      return;
    }

    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 45;

    const ping = async () => {
      try {
        const res = await fetch(`${API_URL}/health`, { cache: "no-store" });
        if (res.ok) {
          if (!cancelled) {
            setReady(true);
            setChecking(false);
          }
          return;
        }
      } catch {
        // Render cold start — keep retrying
      }

      attempts += 1;
      if (attempts >= maxAttempts) {
        if (!cancelled) {
          setReady(true);
          setChecking(false);
        }
        return;
      }

      if (!cancelled) {
        setTimeout(ping, 2000);
      }
    };

    ping();

    return () => {
      cancelled = true;
    };
  }, []);

  return { ready, checking };
}
