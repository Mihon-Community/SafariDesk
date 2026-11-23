import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { Quote, QuoteInput } from "../lib/types";

/**
 * Live quote on the new-booking form: debounce field changes by 350 ms so we
 * do not fire a request per keystroke, and only call once the trip is fully
 * specified.
 */
export function useQuote(input: Partial<QuoteInput>) {
  const [debounced, setDebounced] = useState(input);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(input), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(input)]);

  const ready = !!(
    debounced.packageId &&
    debounced.pax &&
    debounced.residency &&
    debounced.start
  );

  return useQuery({
    queryKey: ["quote", debounced],
    enabled: ready,
    staleTime: 60_000,
    queryFn: () =>
      api<Quote>("/api/quotes", {
        method: "POST",
        body: debounced as QuoteInput,
      }),
  });
}
