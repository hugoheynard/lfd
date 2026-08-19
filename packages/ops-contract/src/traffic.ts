/**
 * **Ce que la gateway a vu passer**, agrégé sur une fenêtre — la troisième
 * source d'OPS (design §12), à côté du heartbeat (ce qu'un nœud dit de
 * lui-même) et du probe (ce qu'on constate du dehors).
 *
 * Comme `health.ts` et contrairement à `heartbeat.ts` / `event.ts` : **pas de
 * schéma Zod**. La distinction du paquet est déjà posée — on valide ce qui
 * ENTRE (un heartbeat vient d'un émetteur, il peut mentir sur sa forme), on
 * type ce qui SORT. Une fenêtre de trafic est calculée par OPS lui-même à
 * partir d'Analytics Engine ; la valider serait se contrôler soi-même.
 *
 * ## D'où viennent les nombres
 *
 * De l'API SQL d'Analytics Engine, jamais de Postgres. Deux conséquences que le
 * contrat rend explicites :
 *
 *   - **`requests` se lit `SUM(_sample_interval)`**, pas `COUNT(*)`. Analytics
 *     Engine échantillonne quand le volume monte et porte le poids de chaque
 *     point dans cette colonne. Un `COUNT(*)` donnerait le nombre de points
 *     CONSERVÉS — un chiffre juste, d'une autre question.
 *   - **`p95Ms` est pondéré du même poids.** Une latence médiane calculée sur
 *     un échantillon non pondéré ment dès le premier délestage.
 */

/**
 * La part du trafic qu'on veut compter à part. `throttled` (429) et
 * `gatewayFault` ne sont pas des sous-cas d'erreur parmi d'autres :
 *
 *   - **`throttled`** est le throttler applicatif qui mord — la seule défense
 *     qui fonctionne (le rate-limit edge est inerte). Noyé dans les `4xx`, il
 *     serait invisible ; c'est un signe de santé, pas un incident.
 *   - **`gatewayFault`** est un `502` fabriqué par la gateway : le backend
 *     n'a **pas répondu**. C'est le seul comptage qui autorise à conclure qu'un
 *     nœud est mort plutôt que muet.
 */
export interface TrafficCounts {
  /** Toutes requêtes confondues, poids d'échantillonnage inclus. */
  readonly requests: number;
  /** Réponses `5xx` **rendues par le backend** — il a répondu, en échouant. */
  readonly serverErrors: number;
  /** `429` du throttler applicatif. */
  readonly throttled: number;
  /** Réponses fabriquées par la gateway (`502`, `503`) — pas de réponse amont. */
  readonly gatewayFaults: number;
}

/** Le détail par surface appelée (`admin/companies`, `orders`…). */
export interface TrafficSurface extends TrafficCounts {
  readonly surface: string;
  readonly p95Ms: number;
}

/**
 * Ce que la gateway a vu pour **un nœud**, sur **une fenêtre**. `from`/`to`
 * sont des ISO et bornent explicitement : une fenêtre sans bornes ne se compare
 * à rien, et un écran qui affiche « 1 200 requêtes » sans dire sur quoi ment par
 * omission.
 */
export interface TrafficWindow extends TrafficCounts {
  /** Id du nœud, celui du manifeste de topologie (`b2b`, `pim`…). */
  readonly node: string;
  readonly from: string;
  readonly to: string;
  readonly p95Ms: number;
  /** Détail facultatif — absent quand la fenêtre est lue « tous nœuds confondus ». */
  readonly surfaces?: readonly TrafficSurface[];
}

/**
 * Part d'erreurs SERVEUR sur la fenêtre, 0..1. Rend `0` sur une fenêtre vide —
 * et c'est la seule réponse honnête : sans trafic, il n'y a pas de taux, et
 * rendre `null` obligerait chaque appelant à réinventer la même précaution.
 *
 * Les `429` n'y entrent **pas** : le throttler qui refuse est le système qui
 * fonctionne. Les compter comme erreurs ferait rougir la carte au moment précis
 * où elle devrait rassurer.
 */
export function errorRate(counts: TrafficCounts): number {
  if (counts.requests <= 0) {
    return 0;
  }
  return (counts.serverErrors + counts.gatewayFaults) / counts.requests;
}

/**
 * Vrai si **rien** n'est passé sur la fenêtre. C'est la moitié « trafic » de la
 * table du §12 : croisée avec la fraîcheur du heartbeat, elle sépare un nœud
 * **oisif** d'un nœud **mort**. La dérivation du statut, elle, vit ailleurs
 * (J4) — ce contrat ne fait que rendre la question posable.
 */
export function isSilent(counts: TrafficCounts): boolean {
  return counts.requests <= 0;
}

/**
 * D'où viennent les chiffres d'un rapport.
 *
 * `rehearsal` = **répétition** : Analytics Engine n'est pas configuré, les
 * fenêtres sont fabriquées. La valeur voyage jusqu'à l'écran **exprès** — un
 * tableau de bord branché sur un double et qui ne le dit pas est la panne
 * d'observabilité la plus coûteuse qui soit : on croit regarder la production.
 */
export type TrafficSource = "analytics-engine" | "rehearsal";

/** Ce que rend l'endpoint OPS : des fenêtres, et l'aveu de leur provenance. */
export interface TrafficReport {
  readonly generatedAt: string;
  readonly source: TrafficSource;
  readonly windows: readonly TrafficWindow[];
}
