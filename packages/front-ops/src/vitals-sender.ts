import type { WebVitalSample } from "@lfd/ops-contract";

/** Ce dont l'envoi a besoin de `fetch` — injecté pour être éprouvé sans réseau. */
export type VitalsFetch = (input: string, init: RequestInit) => Promise<unknown>;

/**
 * **Envoie les mesures en une requête qui survit à la fermeture de l'onglet**,
 * sans identifiants.
 *
 * 🔴 Ce n'est plus `sendBeacon` (2026-10-10, `todos/todo-vitals-refuses-par-le-cors.md`) :
 * un beacon cross-origin part TOUJOURS en mode `credentials: include`, et le
 * préflight que déclenche `application/json` revenait sans
 * `Access-Control-Allow-Credentials` — le navigateur refusait, et `/health`
 * comptait zéro mesure depuis le premier jour. `fetch` en `keepalive` est le
 * mécanisme dont `sendBeacon` est le raccourci : il tient la même garantie, et
 * laisse dire `credentials: "omit"`.
 *
 * Surtout pas l'autre sortie, `credentials: true` sur le CORS de l'API : elle
 * ouvrirait une frontière de sécurité pour faire passer de la télémétrie.
 * `ops/vitals` est une route publique, elle n'a aucun identifiant à recevoir.
 *
 * Un échec est avalé : une mesure perdue ne doit jamais devenir une erreur
 * dans la page de quelqu'un.
 */
export function sendVitals(
  endpoint: string,
  samples: readonly WebVitalSample[],
  send: VitalsFetch,
): void {
  if (samples.length === 0) {
    return;
  }
  void send(endpoint, {
    method: "POST",
    keepalive: true,
    credentials: "omit",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ samples }),
  }).catch(() => undefined);
}
