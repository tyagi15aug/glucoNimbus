import type { CanonicalGlucoseEvent } from "@glucostream/types";

export interface PublishResult {
  ok: boolean;
  status?: number;
}

/** POSTs one reading to the ingestion API. Network/HTTP errors are caught and reported, not thrown — a single failed reading should never crash the replay loop. */
export async function publishReading(apiUrl: string, event: CanonicalGlucoseEvent): Promise<PublishResult> {
  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(event),
    });
    return { ok: response.ok, status: response.status };
  } catch {
    return { ok: false };
  }
}
