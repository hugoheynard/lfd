import { randomBytes } from "node:crypto";

/**
 * Trace Context **W3C** (`traceparent`) — standard OpenTelemetry-ready, pas un
 * en-tête maison. Format : `version-traceId-parentId-flags`, p.ex.
 * `00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01`.
 *
 * On n'extrait que le **traceId** (32 hex). Absent ou malformé (dont l'ID nul,
 * invalide au sens W3C) → on en génère un neuf : le backend reste corrélable
 * même en accès direct, sans gateway devant.
 */
const TRACEPARENT = /^[0-9a-f]{2}-([0-9a-f]{32})-[0-9a-f]{16}-[0-9a-f]{2}$/;
const ALL_ZERO_TRACE_ID = "00000000000000000000000000000000";

/** Extrait le traceId d'un en-tête `traceparent`, ou en génère un neuf. */
export function extractOrCreateTraceId(header: string | string[] | undefined): string {
  const raw = Array.isArray(header) ? header[0] : header;
  if (typeof raw === "string") {
    const match = TRACEPARENT.exec(raw.trim().toLowerCase());
    const traceId = match?.[1];
    if (traceId !== undefined && traceId !== ALL_ZERO_TRACE_ID) {
      return traceId;
    }
  }
  return newTraceId();
}

/** Un traceId W3C neuf : 16 octets aléatoires en hexadécimal (32 caractères). */
export function newTraceId(): string {
  return randomBytes(16).toString("hex");
}
