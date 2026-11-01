import type { WallClock } from "../../platform/time/wall-clock.js";
import type { FetchFn } from "./ban-geocoder.js";

/**
 * Présente le jeton de la passerelle à chaque appel (lot 8 bis, L8b-C2) :
 * `Authorization: Bearer`, jamais dans l'URL — une URL finit dans les
 * journaux, un en-tête non. Sans jeton (OSRM local nu), l'appel part tel quel.
 */
export function withBearer(fetchFn: FetchFn, token: string | null): FetchFn {
  if (token === null) {
    return fetchFn;
  }
  return (url, init) => {
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${token}`);
    return fetchFn(url, { ...init, headers });
  };
}

/** Ce qu'un appel à OSRM a rendu : la valeur lue, ou la raison de l'échec (pour le journal). */
export type OsrmFetchOutcome<T> = { readonly value: T } | { readonly failure: string };

/** Le statut qu'`lfd-route-planner` rend quand l'instance se réveille ou refuse (`apps/lfd-route-planner/src/dispatch.ts`). */
const SERVICE_UNAVAILABLE = 503;

/**
 * **Le budget TOTAL d'attente d'un réveil** (2026-11-01, décision de Hugo) :
 * une instance `basic` endormie copie sa carte sur le disque puis la charge,
 * et un seul nouvel essai après 20 s abandonnait souvent avant la fin — « le
 * calcul routier ne répond pas » en production.
 *
 * 90 s : sous les 100 s au-delà desquelles le mandataire de Cloudflare coupe
 * une réponse d'origine (524), la seule borne qu'un « Proposer » puisse
 * rencontrer en amont. Ni la passerelle ni `lfd-api` n'en posent de plus
 * courte (vérifié le 2026-11-01 : aucun délai dans `gateway/src` ni dans
 * `apps/lfd-api/container`, aucun `requestTimeout` dans `main.ts`, aucun
 * `timeout()` dans les services HTTP du back-office).
 */
export const OSRM_WAKE_BUDGET_MS = 90_000;

/** Les pauses entre deux essais, croissantes ; la dernière se répète. */
export const OSRM_WAKE_PAUSES_MS: readonly number[] = [2_000, 5_000, 10_000, 15_000];

/**
 * Le rythme des nouveaux essais : le budget, une mesure du temps ÉCOULÉ (le
 * mur, pas l'instant gelé de la requête — `WallClock`), et la pause. Doublé
 * en test pour ne pas attendre 90 s.
 */
export interface OsrmWakePacing {
  readonly budgetMs: number;
  elapsedMs(): number;
  pause(ms: number): Promise<void>;
}

/** Le rythme réel : le mur pour mesurer, un minuteur pour attendre. */
export function wallClockPacing(
  wall: WallClock,
  budgetMs: number = OSRM_WAKE_BUDGET_MS,
): OsrmWakePacing {
  return {
    budgetMs,
    elapsedMs: () => wall.elapsedNow().getTime(),
    pause: (ms) =>
      new Promise((resolve) => {
        setTimeout(resolve, ms);
      }),
  };
}

/** Une tentative : la valeur, ou l'échec — et s'il vaut un nouvel essai. */
type Attempt<T> = OsrmFetchOutcome<T> & { readonly retryable?: boolean };

/**
 * **Un appel GET à OSRM, qui attend le réveil** quand l'échec y ressemble
 * (délai dépassé, ou 503) : nouveaux essais après des pauses croissantes
 * ({@link OSRM_WAKE_PAUSES_MS}), tant qu'une pause PLUS un essai complet
 * tiennent encore dans le budget — l'attente totale ne le dépasse donc
 * jamais. Un refus (400), une réponse illisible ou une coupure franche ne se
 * rejouent pas : ils rendraient la même chose.
 *
 * `read` lit le corps défensivement et rend `null` s'il ne le comprend pas.
 */
export async function osrmGet<T>(
  fetchFn: FetchFn,
  url: string,
  timeoutMs: number,
  pacing: OsrmWakePacing,
  read: (body: unknown) => T | null,
): Promise<OsrmFetchOutcome<T>> {
  const startedAt = pacing.elapsedMs();
  let last = await attempt(fetchFn, url, timeoutMs, read);
  const firstFailure = "failure" in last ? last.failure : null;
  for (let tries = 1; "failure" in last && last.retryable === true; tries += 1) {
    const pauseMs = pauseAfter(tries);
    if (pacing.elapsedMs() - startedAt + pauseMs + timeoutMs > pacing.budgetMs) {
      return tries === 1
        ? { failure: last.failure }
        : {
            failure: `${String(firstFailure)}, puis ${last.failure} après ${String(tries)} essais`,
          };
    }
    await pacing.pause(pauseMs);
    last = await attempt(fetchFn, url, timeoutMs, read);
  }
  return last;
}

/** La pause après le `tries`-ième essai. */
function pauseAfter(tries: number): number {
  const longest = OSRM_WAKE_PAUSES_MS[OSRM_WAKE_PAUSES_MS.length - 1] ?? 0;
  return OSRM_WAKE_PAUSES_MS[tries - 1] ?? longest;
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
