import type { FetchFn } from "./ban-geocoder.js";

/** Ce qu'un appel à OSRM a rendu : la valeur lue, ou la raison de l'échec (pour le journal). */
export type OsrmFetchOutcome<T> = { readonly value: T } | { readonly failure: string };

/** Le statut qu'`lfd-osrm` rend quand l'instance se réveille ou refuse (`apps/lfd-osrm/src/worker.ts`). */
const SERVICE_UNAVAILABLE = 503;

/** Une tentative : la valeur, ou l'échec — et s'il vaut un nouvel essai. */
type Attempt<T> = OsrmFetchOutcome<T> & { readonly retryable?: boolean };

/**
 * **Un appel GET à OSRM, avec UN nouvel essai** (L10b-C5) quand l'échec
 * ressemble à un réveil : délai dépassé, ou 503. Un refus (400), une réponse
 * illisible ou une coupure franche ne se rejouent pas — ils rendraient la
 * même chose.
 *
 * `read` lit le corps défensivement et rend `null` s'il ne le comprend pas.
 */
export async function osrmGet<T>(
  fetchFn: FetchFn,
  url: string,
  timeoutMs: number,
  read: (body: unknown) => T | null,
): Promise<OsrmFetchOutcome<T>> {
  const first = await attempt(fetchFn, url, timeoutMs, read);
  if (!("failure" in first) || first.retryable !== true) {
    return first;
  }
  const second = await attempt(fetchFn, url, timeoutMs, read);
  return "value" in second
    ? second
    : { failure: `${first.failure}, puis ${second.failure} au nouvel essai` };
}

async function attempt<T>(
  fetchFn: FetchFn,
  url: string,
  timeoutMs: number,
  read: (body: unknown) => T | null,
): Promise<Attempt<T>> {
  const signal = AbortSignal.timeout(timeoutMs);
  try {
    const response = await fetchFn(url, { method: "GET", signal });
    if (!response.ok) {
      return {
        failure: `statut ${String(response.status)}`,
        retryable: response.status === SERVICE_UNAVAILABLE,
      };
    }
    const value = read(await response.json());
    return value === null ? { failure: "réponse illisible" } : { value };
  } catch (error: unknown) {
    if (signal.aborted) {
      return { failure: "délai dépassé", retryable: true };
    }
    return { failure: error instanceof Error ? error.name : "coupure inattendue" };
  }
}
