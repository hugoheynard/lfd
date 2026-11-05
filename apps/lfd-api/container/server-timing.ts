/**
 * Ajoute une étape à `Server-Timing`, après celles que les sauts suivants ont
 * déjà posées — `documentation/caching-usage/carte-des-caches.md`, § 6 (posé par le lot L0 de la latence de navigation, 2026-11-04).
 *
 * La réponse d'un `fetch()` a des en-têtes immuables : on en refait une, même
 * corps (non relu, toujours en flux), mêmes statut et en-têtes.
 */
export function withServerTiming(
  response: Response,
  name: string,
  durationMs: number,
  description?: unknown,
): Response {
  const timed = new Response(response.body, response);
  const desc = typeof description === "string" ? `;desc="${description}"` : "";
  timed.headers.append("Server-Timing", `${name};dur=${durationMs.toFixed(1)}${desc}`);
  return timed;
}
