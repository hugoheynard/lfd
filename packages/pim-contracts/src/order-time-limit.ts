import { z } from "zod";

/**
 * **Le point d'arrêt de prise de commande**, déclaré par le référentiel.
 *
 * ## Ce que ça répond, et ce que ça ne répond pas
 *
 * « Jusqu'à quand accepte-t-on une commande pour un acheminement le jour J ? »
 * — et rien d'autre. Ni où l'on retire, ni comment on livre : ce sont des faits
 * d'acheminement, et ils ne font pas varier le moment où la production ferme.
 *
 * Le modèle précédent accrochait la règle à un **point de retrait**. Un point de
 * retrait n'est ni un lieu de production ni un lieu de livraison : c'est
 * l'endroit où un client vient chercher. La conséquence se voyait — une
 * commande livrée ne pouvait matcher aucune règle de point, donc toute la moitié
 * livrée du commerce n'avait qu'une seule limite possible.
 *
 * ## L'échelle
 *
 * `global → famille → produit → déclinaison`, la même que celle des prix
 * (`PriceScopeType`), et pour la même raison : deux vocabulaires de portée pour
 * la même idée finiraient par diverger, et le back-office montrerait « Famille »
 * d'un côté et « Catégorie » de l'autre.
 *
 * - **global** — on ferme toute la production à telle heure ;
 * - **famille** — la viennoiserie et le pain n'ont pas la même charge ;
 * - **produit** / **déclinaison** — le cas particulier, jusqu'au conditionnement
 *   (le pot de 200 g et le seau de 5 kg ne se préparent pas pareil).
 *
 * ## L'héritage se fait CHAMP PAR CHAMP
 *
 * C'est la décision qui fait tenir le reste. Un rang pose ce qu'il change, et
 * hérite du reste : « le pain ferme à 16 h » ne recopie pas le nombre de jours,
 * « l'entremets demande un jour de plus » ne recopie pas l'heure. Le jour où le
 * labo passe de 18 h à 16 h, **tout ce qui n'a pas d'heure propre suit** — alors
 * qu'une règle recopiée entière serait restée figée, en silence, sur chaque
 * article qui l'avait dupliquée.
 *
 * `null` ne veut donc pas dire « aucune limite » : il veut dire **« ce rang ne
 * se prononce pas »**. Confondre les deux empêcherait de déclarer une famille
 * explicitement libre sous un global contraignant.
 */

/** Les portées, du plus général au plus précis. Mêmes valeurs que `PriceScopeType`. */
export const ORDER_TIME_LIMIT_SCOPES = ["global", "category", "product", "variant"] as const;
export const orderTimeLimitScopeTypeSchema = z.enum(ORDER_TIME_LIMIT_SCOPES);
export type OrderTimeLimitScopeType = (typeof ORDER_TIME_LIMIT_SCOPES)[number];

export const ORDER_TIME_LIMIT_SCOPE_LABELS: Readonly<Record<OrderTimeLimitScopeType, string>> = {
  global: "Toute la production",
  category: "Famille",
  product: "Produit",
  variant: "Déclinaison",
};

/** `HH:MM` en 24 h — l'heure de pendule d'Europe/Paris, jamais un instant UTC. */
export const orderLimitTimeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/u, "heure attendue au format HH:MM");

/**
 * La portée visée. `id` est `null` **si et seulement si** `type === 'global'` :
 * une portée « famille » sans famille ne vise rien, et une portée « toute la
 * production » qui nomme une famille dit deux choses contradictoires. Le serveur
 * refuse dans les deux sens.
 */
export const orderTimeLimitScopeSchema = z.object({
  type: orderTimeLimitScopeTypeSchema,
  id: z.string().trim().min(1).nullable(),
});
export type OrderTimeLimitScope = z.infer<typeof orderTimeLimitScopeSchema>;

/**
 * Ce qu'un rang pose. **Les trois champs sont optionnels** — c'est l'héritage
 * champ par champ. Un payload dont les trois valent `null` ne dit rien : le
 * serveur le refuse plutôt que d'écrire une ligne muette.
 */
export const orderTimeLimitPayloadSchema = z.object({
  scope: orderTimeLimitScopeSchema,
  /** Combien de jours **avant** l'acheminement la limite tombe. `0` = le jour même. */
  daysBefore: z.number().int().min(0).max(14).nullable().default(null),
  /** L'heure de la limite, ce jour-là. */
  time: orderLimitTimeSchema.nullable().default(null),
  /**
   * Le rattrapage accordé après la limite, en minutes. Plafonné à 12 h : au-delà
   * ce n'est plus un rattrapage, c'est une autre limite, et elle doit se saisir
   * comme telle pour rester lisible.
   */
  graceMinutes: z.number().int().min(0).max(720).nullable().default(null),
});
export type OrderTimeLimitPayload = z.infer<typeof orderTimeLimitPayloadSchema>;

/** Une règle telle qu'elle est relue. */
export interface OrderTimeLimitView {
  readonly id: string;
  readonly scope: OrderTimeLimitScope;
  /** Le nom de la famille / du produit visé, résolu pour l'affichage. */
  readonly scopeLabel: string | null;
  readonly daysBefore: number | null;
  readonly time: string | null;
  readonly graceMinutes: number | null;
}

/**
 * Le résultat de l'héritage : une règle **complète**, ou `null` quand aucun rang
 * n'a posé de quoi en faire une.
 *
 * `graceMinutes` n'a pas de `null` ici : un rattrapage non déclaré vaut `0`,
 * c'est-à-dire « la limite est ferme ». `daysBefore` et `time`, eux, n'ont pas
 * de valeur par défaut raisonnable — inventer « la veille à 18 h » ferait
 * refuser des commandes au nom d'une règle que personne n'a écrite.
 */
export interface ResolvedOrderTimeLimit {
  readonly daysBefore: number;
  readonly time: string;
  readonly graceMinutes: number;
}

/**
 * Ce que rend la pose d'une limite.
 *
 * Déclaré ICI et pas dans le front : une forme de réponse redéclarée côté client
 * en devient une **copie**, et une copie ne suit pas — le serveur change, le
 * front compile toujours, et l'écran affiche `undefined`.
 */
export interface SetOrderTimeLimitResponse {
  readonly id: string;
}
