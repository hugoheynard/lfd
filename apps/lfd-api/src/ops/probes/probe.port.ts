/**
 * **Les sondes** — ce qu'on constate du dehors sur ce qu'on ne possède pas.
 *
 * Troisième et dernière source d'OPS, à côté du battement (ce qu'un nœud dit de
 * lui-même) et du trafic (ce que la gateway a vu passer). Elle est la seule qui
 * parle des tiers : Auth0, Stripe, Resend, Shopify n'émettront jamais vers
 * nous, et la gateway ne les voit pas.
 *
 * Trois règles, et chacune vient d'une façon connue de se tromper :
 *
 * 1. **Léger et stable.** Une sonde qui tape une route lourde mesure la route,
 *    pas le service. On vise l'appel le moins cher qui prouve quelque chose.
 * 2. **Jamais dans le chemin critique.** Une sonde lente ou bloquée ne doit
 *    ralentir aucune requête métier — d'où le délai d'attente court, et le fait
 *    qu'elles tournent toutes en parallèle.
 * 3. **Non configuré ≠ en panne.** Un tiers dont on n'a pas les identifiants
 *    n'est pas tombé : on ne sait pas. Les confondre ferait rougir la carte
 *    pour une case vide dans un fichier d'environnement.
 */

/** Ce qu'une sonde constate. `unknown` = on n'a pas pu regarder. */
export type ProbeVerdict = "up" | "down" | "unknown";

export interface ProbeOutcome {
  readonly verdict: ProbeVerdict;
  /** Durée de l'aller-retour, en millisecondes. */
  readonly latencyMs: number;
  /**
   * Ce qu'on a constaté, en clair. Il voyage jusqu'à l'écran : « jeton refusé »
   * et « injoignable » demandent deux gestes différents, et un statut seul ne
   * les distingue pas.
   */
  readonly detail?: string;
}

/**
 * Une sonde. `id` est l'identifiant du **nœud** qu'elle éclaire — c'est la
 * couture avec la topologie, et la seule.
 */
export abstract class NodeProbe {
  abstract readonly id: string;
  abstract check(): Promise<ProbeOutcome>;
}

/** Le jeton d'injection multiple : toutes les sondes enregistrées. */
export const NODE_PROBES = Symbol("NODE_PROBES");

/** Au-delà, on n'attend plus : une sonde n'a pas le droit de faire attendre. */
export const PROBE_TIMEOUT_MS = 2500;

/**
 * Un appel HTTP de sonde, ramené à un verdict.
 *
 * `2xx`/`3xx` ⇒ debout. `401`/`403` ⇒ **debout, mais on n'y a plus accès** — le
 * service répond, c'est notre clé qui ne vaut plus. C'est la panne la plus
 * fréquente et la plus silencieuse, et la confondre avec une panne du tiers
 * enverrait chercher un incident chez quelqu'un d'autre.
 */
export async function probeHttp(
  request: () => Promise<Response>,
  startedAt: number,
): Promise<ProbeOutcome> {
  try {
    const response = await request();
    const latencyMs = Date.now() - startedAt;
    if (response.status === 401 || response.status === 403) {
      return { verdict: "down", latencyMs, detail: `accès refusé (${response.status})` };
    }
    if (!response.ok) {
      return { verdict: "down", latencyMs, detail: `réponse ${response.status}` };
    }
    return { verdict: "up", latencyMs };
  } catch {
    return { verdict: "down", latencyMs: Date.now() - startedAt, detail: "injoignable" };
  }
}
