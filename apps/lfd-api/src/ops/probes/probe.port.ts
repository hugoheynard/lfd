/**
 * **Les sondes** — ce qu'on constate du dehors sur ce qu'on ne possède pas.
 *
 * Troisième et dernière source d'OPS, à côté du battement (ce qu'un nœud dit de
 * lui-même) et du trafic (ce que la gateway a vu passer). Elle est la seule qui
 * parle des tiers : Auth0, Stripe, Resend n'émettront jamais vers nous, et la
 * gateway ne les voit pas.
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
 * Une réponse non-`2xx` telle qu'une sonde la reçoit — de quoi la reconnaître,
 * rien de plus.
 */
export interface ProbeAnswer {
  readonly status: number;
  /** Le corps en texte, vide quand il n'y en a pas ou qu'il est illisible. */
  readonly body: string;
}

/**
 * Ce qu'un tiers rend quand il est **là** sans nous servir ce qu'on demande :
 * le détail à afficher si la réponse est reconnue, `null` sinon.
 *
 * Propre à chaque tiers, et c'est pour ça qu'elle vit à côté de sa sonde : une
 * clé Stripe restreinte répond `403`, une clé Resend « envoi seulement » répond
 * `401` avec un nom d'erreur à elle, et un `401` sans ce nom est une clé morte.
 * Deux réponses du même code, deux diagnostics.
 */
export type ReachableAnswer = (answer: ProbeAnswer) => string | null;

/**
 * Un appel HTTP de sonde, ramené à un verdict.
 *
 * `2xx`/`3xx` ⇒ debout. Toute autre réponse ⇒ **tombé**, sauf si le tiers l'a
 * déclarée « joignable » par `reachable` — et alors debout, avec le détail
 * qu'elle nomme. `401`/`403` restent tombés par défaut : une clé révoquée ne
 * prouve pas que le service nous sert, et c'est la panne la plus silencieuse.
 */
export async function probeHttp(
  request: () => Promise<Response>,
  startedAt: number,
  reachable?: ReachableAnswer,
): Promise<ProbeOutcome> {
  let response: Response;
  try {
    response = await request();
  } catch {
    return { verdict: "down", latencyMs: Date.now() - startedAt, detail: "injoignable" };
  }
  const latencyMs = Date.now() - startedAt;
  if (response.ok) {
    return { verdict: "up", latencyMs };
  }
  if (reachable !== undefined) {
    const body = await response.text().catch(() => "");
    const detail = reachable({ status: response.status, body });
    if (detail !== null) {
      return { verdict: "up", latencyMs, detail };
    }
  }
  if (response.status === 401 || response.status === 403) {
    return { verdict: "down", latencyMs, detail: `accès refusé (${response.status})` };
  }
  return { verdict: "down", latencyMs, detail: `réponse ${response.status}` };
}
