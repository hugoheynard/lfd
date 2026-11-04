/**
 * Ajoute une étape à `Server-Timing`, après celles que les sauts suivants ont
 * déjà posées — plan `documentation/caching-usage/plan-latence-de-navigation.md`, L0.
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
